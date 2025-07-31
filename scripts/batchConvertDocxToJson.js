const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

/**
 * Batch convert all DOCX files in the specified directory to a single JSON file
 * Each DOCX file represents a Quran page numbered by filename (e.g., 1.docx = page 1)
 */

const CONFIG = {
    inputDirectory: 'quran-styles/hafs',
    outputFile: 'public/quran-pages/new_data_hafs.json',
    isDebugging: true
};

/**
 * Convert a single DOCX file to structured content
 * @param {string} filePath - Path to the DOCX file
 * @returns {Object} Structured page content
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
        
        const content = [];
        $('body > *').each((i, element) => {
            const tagName = $(element).prop('tagName').toLowerCase();
            const text = $(element).text().trim();
            
            if (text) { // Only add non-empty content
                if (tagName === 'p') {
                    content.push({
                        type: 'paragraph',
                        text: text
                    });
                } else if (tagName.match(/^h[1-6]$/)) {
                    content.push({
                        type: 'heading',
                        level: parseInt(tagName.replace('h', '')),
                        text: text
                    });
                }
            }
        });

        return content;

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
            .filter(file => !isNaN(file.pageNumber)) // Only include valid page numbers
            .sort((a, b) => a.pageNumber - b.pageNumber); // Sort numerically

        return docxFiles;
    } catch (error) {
        console.error('Error reading directory:', error);
        throw error;
    }
}

/**
 * Process all DOCX files and create the final JSON structure
 * @param {string} inputDir - Input directory path
 * @param {string} outputFile - Output JSON file path
 */
async function batchConvertToJson(inputDir, outputFile) {
    console.log('🚀 Starting batch conversion of DOCX files to JSON...');
    
    try {
        // Get all DOCX files
        const docxFiles = await getDocxFiles(inputDir);
        console.log(`📄 Found ${docxFiles.length} DOCX files to process`);

        if (docxFiles.length === 0) {
            throw new Error('No DOCX files found in the specified directory');
        }

        // Initialize the result structure
        const quranData = {
            metadata: {
                totalPages: docxFiles.length,
                style: 'hafs',
                generatedAt: new Date().toISOString(),
                description: 'Arabic Quran pages converted from DOCX format'
            },
            pages: {}
        };

        // Process each file
        let processedCount = 0;
        const totalFiles = docxFiles.length;

        for (const file of docxFiles) {
            try {
                if (CONFIG.isDebugging) {
                    console.log(`📖 Processing page ${file.pageNumber} (${file.filename})...`);
                }

                const pageContent = await convertSingleDocx(file.fullPath);
                
                quranData.pages[file.pageNumber] = {
                    pageNumber: file.pageNumber,
                    filename: file.filename,
                    content: pageContent,
                    wordCount: pageContent.reduce((count, item) => {
                        return count + (item.text ? item.text.split(/\s+/).length : 0);
                    }, 0)
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
                    content: []
                };
            }
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputFile);
        await fs.mkdir(outputDir, { recursive: true });

        // Write the final JSON file
        await fs.writeFile(outputFile, JSON.stringify(quranData, null, 2), 'utf8');
        
        console.log(`🎉 Conversion completed successfully!`);
        console.log(`📁 Output saved to: ${outputFile}`);
        console.log(`📊 Total pages processed: ${processedCount}/${totalFiles}`);
        console.log(`📏 Output file size: ${(await fs.stat(outputFile)).size} bytes`);

        // Show sample of first page for verification
        const firstPageKey = Math.min(...Object.keys(quranData.pages).map(Number));
        if (quranData.pages[firstPageKey] && quranData.pages[firstPageKey].content.length > 0) {
            console.log(`\n📋 Sample from page ${firstPageKey}:`);
            console.log(`   ${quranData.pages[firstPageKey].content[0].text.substring(0, 100)}...`);
        }

    } catch (error) {
        console.error('❌ Batch conversion failed:', error);
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
        const outputPath = path.resolve(CONFIG.outputFile);
        
        console.log(`📂 Input directory: ${inputPath}`);
        console.log(`📄 Output file: ${outputPath}`);
        
        // Check if input directory exists
        try {
            await fs.access(inputPath);
        } catch (error) {
            throw new Error(`Input directory does not exist: ${inputPath}`);
        }

        await batchConvertToJson(inputPath, outputPath);
        
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
    batchConvertToJson,
    convertSingleDocx,
    getDocxFiles
};
