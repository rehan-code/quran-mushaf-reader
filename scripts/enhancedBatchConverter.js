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
    qiraat: 'hafs', // hafs / hisham / ibn-dhakwan / qpc-nastaleeq / hafs-digital-khatt / hisham-digital-khatt / ibn-dhakwan-digital-khatt
    inputDirectory: `quran-styles/${CONFIG.qiraat}`,
    csvFile: 'quran-styles/pages.csv',
    outputFile: `public/quran-pages/enhanced_data_${CONFIG.qiraat}.json`,
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
 * Convert a single DOCX file to structured content with highlighting information
 * @param {string} filePath - Path to the DOCX file
 * @returns {Array} Array of text content with highlighting markers
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
                                    // Mark highlighted text with special markers for red words
                                    if (run.highlight && textElement.value && textElement.value.trim() && /[\w\d\u0600-\u06FF]/.test(textElement.value)) {
                                        // Use a consistent marker for red/highlighted words
                                        existingText = `<RED>${textElement.value}</RED>`;
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
                                // Mark highlighted text with special markers for red words
                                if (run.highlight && textElement.value && textElement.value.trim() && /[\w\d\u0600-\u06FF]/.test(textElement.value)) {
                                    textElement.value = `<RED>${textElement.value}</RED>`;
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
 * Parse text to extract red words and create word structure
 * @param {string} text - Text with red word markers
 * @returns {Array} Array of word objects with red word indicators
 */
function parseTextWithRedWords(text) {
    const words = [];
    const redWordRegex = /<RED>(.*?)<\/RED>/g;
    let lastIndex = 0;
    let match;
    
    // Find all red words and their positions
    while ((match = redWordRegex.exec(text)) !== null) {
        // Add normal words before the red word
        const beforeText = text.substring(lastIndex, match.index).trim();
        if (beforeText) {
            beforeText.split(/\s+/).forEach(word => {
                if (word.trim()) {
                    words.push({ text: word.trim(), isRed: false });
                }
            });
        }
        
        // Add the red word
        words.push({ text: match[1].trim(), isRed: true });
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining normal words after the last red word
    const afterText = text.substring(lastIndex).trim();
    if (afterText) {
        afterText.split(/\s+/).forEach(word => {
            if (word.trim()) {
                words.push({ text: word.trim(), isRed: false });
            }
        });
    }
    
    return words;
}

/**
 * Merge DOCX text content with CSV alignment data
 * @param {Array} textContent - Array of text lines from DOCX
 * @param {Array} csvLines - Array of CSV line data
 * @returns {Array} Merged line data
 */
function mergeContentWithAlignment(textContent, csvLines) {
    const mergedLines = [];
    let docxLineIndex = 0;
    
    for (const csvLine of csvLines) {
        let lineText = '';
        let words = [];
        
        if (csvLine.lineType === 'ayah') {
            // For ayah lines, use text from DOCX and parse for red words
            if (docxLineIndex < textContent.length) {
                lineText = textContent[docxLineIndex];
                words = parseTextWithRedWords(lineText);
                // Clean the text for display (remove red markers)
                lineText = lineText.replace(/<RED>(.*?)<\/RED>/g, '$1');
                docxLineIndex++;
            }
        } else if (csvLine.lineType === 'surah_name') {
            // For surah name lines, create an indicator
            lineText = `[SURAH_NAME:${csvLine.surahNumber}]`;
        } else if (csvLine.lineType === 'basmallah') {
            // For basmallah lines, create an indicator
            lineText = '[BASMALLAH]';
        }
        
        if (lineText) {
            mergedLines.push({
                lineNumber: csvLine.lineNumber,
                lineType: csvLine.lineType,
                text: lineText,
                words: words, // Include parsed words with red indicators
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
 * Determine if a page should be centered based on its lines
 * @param {Array} csvLines - Array of CSV line data for the page
 * @returns {boolean} Whether the page should be centered
 */
function getPageCentering(csvLines) {
    // A page is centered if the majority of its ayah lines are centered
    const ayahLines = csvLines.filter(line => line.lineType === 'ayah');
    if (ayahLines.length === 0) return true; // Default to centered if no ayah lines
    
    const centeredCount = ayahLines.filter(line => line.isCentered).length;
    return centeredCount > ayahLines.length / 2;
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
                
                // Determine if this page should be centered
                const isCentered = getPageCentering(csvLines);
                
                quranData.pages[file.pageNumber] = {
                    pageNumber: file.pageNumber,
                    filename: file.filename,
                    isCentered: isCentered,
                    lines: mergedLines,
                    metadata: {
                        totalLines: mergedLines.length,
                        wordCount: mergedLines.reduce((count, line) => {
                            return count + (line.text ? line.text.split(/\s+/).length : 0);
                        }, 0),
                        surahInfo: surahInfo,
                        hasAlignment: csvLines.length > 0,
                        hasRedWords: mergedLines.some(line => line.words && line.words.some(word => word.isRed))
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
                    isCentered: true, // Default to centered for error cases
                    error: error.message,
                    lines: [],
                    metadata: { totalLines: 0, wordCount: 0, surahInfo: {}, hasAlignment: false, hasRedWords: false }
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
