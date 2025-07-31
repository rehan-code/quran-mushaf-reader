const mammoth = require('mammoth');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parse } = require('csv-parse');

/**
 * Enhanced batch converter that merges DOCX content with CSV alignment data
 * Creates a comprehensive JSON structure optimized for web rendering
 */

const CONFIG = {
    inputDirectory: 'quran-styles/hafs',
    csvFile: 'quran-styles/pages.csv',
    outputFile: 'public/quran-pages/enhanced_data_hafs.json',
    isDebugging: true
};

/**
 * Parse CSV file to get alignment and layout data
 * @param {string} csvFilePath - Path to the CSV file
 * @returns {Object} Parsed CSV data organized by page
 */
async function parseCsvData(csvFilePath) {
    return new Promise((resolve, reject) => {
        const pageData = {};
        const parser = parse({
            delimiter: ',',
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        fsSync.createReadStream(csvFilePath)
            .pipe(parser)
            .on('data', (record) => {
                const pageNum = parseInt(record.page_number);
                if (!pageData[pageNum]) {
                    pageData[pageNum] = [];
                }
                
                pageData[pageNum].push({
                    lineNumber: parseInt(record.line_number),
                    lineType: record.line_type,
                    isCentered: record.is_centered === '1',
                    firstWordId: record.first_word_id ? parseInt(record.first_word_id) : null,
                    lastWordId: record.last_word_id ? parseInt(record.last_word_id) : null,
                    surahNumber: record.surah_number ? parseInt(record.surah_number) : null
                });
            })
            .on('end', () => {
                // Sort lines by line number for each page
                Object.keys(pageData).forEach(pageNum => {
                    pageData[pageNum].sort((a, b) => a.lineNumber - b.lineNumber);
                });
                resolve(pageData);
            })
            .on('error', (err) => {
                console.error('Error parsing CSV:', err.message);
                reject(err);
            });
    });
}

/**
 * Convert a single DOCX file to structured content
 * @param {string} filePath - Path to the DOCX file
 * @returns {Array} Array of text content
 */
async function convertSingleDocx(filePath) {
    try {
        const result = await mammoth.convertToHtml({ path: filePath }, {
            transformDocument: document => {
                let notesIndex = -1;
                let combinedTextIndex = -1;
                
                document.children.forEach((paragraph, paragraphIdx) => {
                    let combinedText = '';
                    paragraph.children.forEach((run, runIdx) => {
                        if (run.type === "run" && run.children) {
                            run.children.forEach(textElement => {
                                if (notesIndex > -1) {
                                    let existingText = '';
                                    if (run.highlight && textElement.value && textElement.value.trim() && /[\w\d\u0600-\u06FF]/.test(textElement.value)) {
                                        existingText = `~${run.highlight}~[${textElement.value}]`;
                                    }
                                    combinedText += existingText !== '' ? existingText : textElement.value;
                                    if (combinedTextIndex === -1) {
                                        combinedTextIndex = runIdx;
                                    } else {
                                        document.children[paragraphIdx].children[combinedTextIndex].children[0].value = combinedText;
                                        textElement.value = '';
                                    }
                                }
                                if (textElement.value.toLowerCase().includes('note')) {
                                    notesIndex = paragraphIdx;
                                }
                                if (run.highlight && textElement.value && textElement.value.trim() && /[\w\d\u0600-\u06FF]/.test(textElement.value)) {
                                    textElement.value = `~${run.highlight}~[${textElement.value}]`;
                                }
                            });
                        }
                    });
                });
                
                return document;
            },
        });

        const html = result.value;
        const $ = cheerio.load(html);
        
        const textContent = [];
        $('body > *').each((i, element) => {
            const text = $(element).text().trim();
            if (text) {
                textContent.push(text);
            }
        });

        return textContent;

    } catch (error) {
        if (CONFIG.isDebugging) {
            console.error(`Error converting ${filePath}:`, error.message);
        }
        throw error;
    }
}

/**
 * Get all DOCX files from the input directory and sort them numerically
 * @param {string} directoryPath - Path to the directory containing DOCX files
 * @returns {Array} Sorted array of file objects with page numbers
 */
async function getDocxFiles(directoryPath) {
    try {
        const files = await fs.readdir(directoryPath);
        const docxFiles = files
            .filter(file => file.endsWith('.docx'))
            .map(file => {
                const pageNumber = parseInt(path.basename(file, '.docx'));
                return {
                    filename: file,
                    pageNumber: pageNumber,
                    fullPath: path.join(directoryPath, file)
                };
            })
            .filter(file => !isNaN(file.pageNumber))
            .sort((a, b) => a.pageNumber - b.pageNumber);

        return docxFiles;
    } catch (error) {
        console.error('Error reading directory:', error);
        throw error;
    }
}

/**
 * Merge DOCX text content with CSV alignment data
 * Only ayah lines use text from DOCX, other line types are indicators
 * @param {Array} textContent - Array of text lines from DOCX
 * @param {Array} csvLines - Array of alignment data from CSV
 * @returns {Array} Merged line data
 */
function mergeContentWithAlignment(textContent, csvLines) {
    const mergedLines = [];
    let ayahTextIndex = 0; // Track which ayah text line we're on
    
    for (const csvLine of csvLines) {
        let lineText = '';
        let isRenderable = true;
        
        switch (csvLine.lineType) {
            case 'ayah':
                // Use text from DOCX for ayah lines
                lineText = textContent[ayahTextIndex] || '';
                ayahTextIndex++;
                break;
                
            case 'surah_name':
                // Indicator for surah name - will be rendered based on surah number
                lineText = `[SURAH_NAME:${csvLine.surahNumber}]`;
                break;
                
            case 'basmallah':
                // Indicator for basmallah - standard text
                lineText = '[BASMALLAH]';
                break;
                
            default:
                // Unknown line type
                lineText = `[${csvLine.lineType.toUpperCase()}]`;
                break;
        }
        
        // Only add lines that have content or are meaningful indicators
        if (lineText.trim()) {
            mergedLines.push({
                lineNumber: csvLine.lineNumber,
                lineType: csvLine.lineType,
                isCentered: csvLine.isCentered,
                text: lineText,
                wordRange: {
                    first: csvLine.firstWordId,
                    last: csvLine.lastWordId
                },
                surahNumber: csvLine.surahNumber,
                isIndicator: csvLine.lineType !== 'ayah'
            });
        }
    }
    
    return mergedLines;
}

/**
 * Get surah information for a page
 * @param {Array} lines - Array of line data for the page
 * @returns {Object} Surah information
 */
function getPageSurahInfo(lines) {
    const surahNumbers = [...new Set(lines.map(line => line.surahNumber).filter(Boolean))];
    const surahNames = lines.filter(line => line.lineType === 'surah_name').map(line => line.text);
    
    return {
        surahNumbers: surahNumbers,
        surahNames: surahNames,
        primarySurah: surahNumbers[0] || null
    };
}

/**
 * Process all DOCX files and create the enhanced JSON structure
 * @param {string} inputDir - Input directory path
 * @param {string} csvFile - CSV file path
 * @param {string} outputFile - Output JSON file path
 */
async function enhancedBatchConvert(inputDir, csvFile, outputFile) {
    console.log('🚀 Starting enhanced batch conversion...');
    
    try {
        // Parse CSV data first
        console.log('📊 Parsing CSV alignment data...');
        const csvData = await parseCsvData(csvFile);
        console.log(`✅ Parsed alignment data for ${Object.keys(csvData).length} pages`);

        // Get all DOCX files
        const docxFiles = await getDocxFiles(inputDir);
        console.log(`📄 Found ${docxFiles.length} DOCX files to process`);

        // Initialize the result structure
        const quranData = {
            metadata: {
                totalPages: docxFiles.length,
                style: 'hafs',
                generatedAt: new Date().toISOString(),
                description: 'Arabic Quran pages with integrated layout and alignment data',
                dataStructure: {
                    version: '2.0',
                    features: ['text_content', 'line_alignment', 'word_ranges', 'surah_info']
                }
            },
            pages: {}
        };

        // Process each file
        let processedCount = 0;
        const totalFiles = docxFiles.length;

        for (const file of docxFiles) {
            try {
                if (CONFIG.isDebugging && processedCount % 50 === 0) {
                    console.log(`📖 Processing page ${file.pageNumber} (${file.filename})...`);
                }

                // Get text content from DOCX
                const textContent = await convertSingleDocx(file.fullPath);
                
                // Get alignment data from CSV
                const csvLines = csvData[file.pageNumber] || [];
                
                // Merge content with alignment data
                const mergedLines = mergeContentWithAlignment(textContent, csvLines);
                
                // Get surah information for this page
                const surahInfo = getPageSurahInfo(mergedLines);
                
                quranData.pages[file.pageNumber] = {
                    pageNumber: file.pageNumber,
                    filename: file.filename,
                    lines: mergedLines,
                    metadata: {
                        totalLines: mergedLines.length,
                        wordCount: mergedLines.reduce((count, line) => {
                            return count + (line.text ? line.text.split(/\s+/).length : 0);
                        }, 0),
                        surahInfo: surahInfo,
                        hasAlignment: csvLines.length > 0
                    }
                };

                processedCount++;
                
                // Show progress every 50 files
                if (processedCount % 50 === 0 || processedCount === totalFiles) {
                    console.log(`✅ Progress: ${processedCount}/${totalFiles} pages processed`);
                }

            } catch (error) {
                console.error(`❌ Failed to process page ${file.pageNumber}:`, error.message);
                // Continue with other files even if one fails
                quranData.pages[file.pageNumber] = {
                    pageNumber: file.pageNumber,
                    filename: file.filename,
                    error: error.message,
                    lines: [],
                    metadata: { totalLines: 0, wordCount: 0, surahInfo: {}, hasAlignment: false }
                };
            }
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputFile);
        await fs.mkdir(outputDir, { recursive: true });

        // Write the final JSON file
        await fs.writeFile(outputFile, JSON.stringify(quranData, null, 2), 'utf8');
        
        console.log(`🎉 Enhanced conversion completed successfully!`);
        console.log(`📁 Output saved to: ${outputFile}`);
        console.log(`📊 Total pages processed: ${processedCount}/${totalFiles}`);
        console.log(`📏 Output file size: ${(await fs.stat(outputFile)).size} bytes`);

        // Show sample of first page for verification
        const firstPageKey = Math.min(...Object.keys(quranData.pages).map(Number));
        if (quranData.pages[firstPageKey] && quranData.pages[firstPageKey].lines.length > 0) {
            console.log(`\n📋 Sample from page ${firstPageKey}:`);
            const firstLine = quranData.pages[firstPageKey].lines[0];
            console.log(`   Line ${firstLine.lineNumber} (${firstLine.lineType}): ${firstLine.text.substring(0, 50)}...`);
            console.log(`   Centered: ${firstLine.isCentered}, Surah: ${firstLine.surahNumber}`);
        }

    } catch (error) {
        console.error('❌ Enhanced batch conversion failed:', error);
        throw error;
    }
}

/**
 * Main execution function
 */
async function main() {
    const startTime = Date.now();
    
    try {
        const inputPath = path.resolve(CONFIG.inputDirectory);
        const csvPath = path.resolve(CONFIG.csvFile);
        const outputPath = path.resolve(CONFIG.outputFile);
        
        console.log(`📂 Input directory: ${inputPath}`);
        console.log(`📊 CSV file: ${csvPath}`);
        console.log(`📄 Output file: ${outputPath}`);
        
        // Check if input files exist
        try {
            await fs.access(inputPath);
            await fs.access(csvPath);
        } catch (error) {
            throw new Error(`Input files not accessible: ${error.message}`);
        }

        await enhancedBatchConvert(inputPath, csvPath, outputPath);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Total processing time: ${duration} seconds`);
        
    } catch (error) {
        console.error('💥 Script execution failed:', error.message);
        process.exit(1);
    }
}

// Run the script if called directly
if (require.main === module) {
    main();
}

module.exports = {
    enhancedBatchConvert,
    parseCsvData,
    mergeContentWithAlignment
};
