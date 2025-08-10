"use client";

import { useState, useEffect } from 'react';

// Define the types for our enhanced data structure
interface QuranLine {
  lineNumber: number;
  lineType: 'ayah' | 'surah_name' | 'basmallah';
  isCentered: boolean;
  text: string;
  wordRange: {
    first: number | null;
    last: number | null;
  };
  surahNumber: number | null;
  isIndicator: boolean;
}

interface QuranPage {
  pageNumber: number;
  filename: string;
  lines: QuranLine[];
  metadata: {
    totalLines: number;
    wordCount: number;
    surahInfo: {
      surahNumbers: number[];
      surahNames: string[];
      primarySurah: number | null;
    };
    hasAlignment: boolean;
  };
}

interface QuranData {
  metadata: {
    totalPages: number;
    style: string;
    generatedAt: string;
    description: string;
    dataStructure: {
      version: string;
      features: string[];
    };
  };
  pages: {
    [pageNumber: string]: QuranPage;
  };
}

const fontClasses: { [key: string]: string } = {
    'me_quran': 'font-me_quran',
    'indopak-nastaleeq': 'font-indopak-nastaleeq',
    'qpc-nastaleeq': 'font-qpc-nastaleeq',
    'digitalkhatt': 'font-digitalkhatt',
};

// Helper function to extract ayah number from Arabic numerals
function extractAyahNumber(text: string): { cleanText: string; ayahNumber: string | null } {
  const arabicNumerals = /[٠-٩]+/g;
  const matches = text.match(arabicNumerals);
  if (matches && matches.length > 0) {
    const ayahNumber = matches[matches.length - 1]; // Get the last number (verse number)
    const cleanText = text.replace(new RegExp(ayahNumber + '$'), '').trim();
    return { cleanText, ayahNumber };
  }
  return { cleanText: text, ayahNumber: null };
}

// Helper function to split text into words and identify ayah boundaries
function parseAyahText(text: string, wordRange: { first: number | null; last: number | null }): Array<{
  word: string;
  ayahNumber: string | null;
  isAyahEnd: boolean;
  ayahClass: string;
}> {
  // Split text by Arabic numerals to identify verse boundaries
  const arabicNumerals = /[٠-٩]+/g;
  const parts = text.split(arabicNumerals);
  const numerals = text.match(arabicNumerals) || [];
  
  const parsedWords: Array<{
    word: string;
    ayahNumber: string | null;
    isAyahEnd: boolean;
    ayahClass: string;
  }> = [];
  
  let currentAyahNumber = 1; // Start with ayah 1, will be incremented as we find verse markers
  
  parts.forEach((part, partIndex) => {
    // Process words in this part
    const words = part.split(/\s+/).filter(word => word.trim());
    words.forEach(word => {
      if (word.trim()) {
        parsedWords.push({
          word: word.trim(),
          ayahNumber: null,
          isAyahEnd: false,
          ayahClass: `ayah-${currentAyahNumber}`
        });
      }
    });
    
    // Add verse marker if there's a corresponding numeral
    if (partIndex < numerals.length) {
      const verseNumber = numerals[partIndex];
      parsedWords.push({
        word: '',
        ayahNumber: verseNumber,
        isAyahEnd: true,
        ayahClass: `ayah-${currentAyahNumber}`
      });
      currentAyahNumber++; // Move to next ayah for subsequent words
    }
  });
  
  return parsedWords;
}

// Component to render surah header
function SurahHeader({ surahNumber }: { surahNumber: number }) {
  return (
    <div className="surah-name">
      <div className="quran-icon surah-header text-center flex justify-center">header</div>
      <div className="surah-icon text-center flex justify-center">
        <span className="surah-name-v4 me-2">surah{surahNumber.toString().padStart(3, '0')}</span>
        <span className="surah-name-v4">surah-icon</span>
      </div>
    </div>
  );
}

// Component to render basmallah
function Basmallah() {
  return (
    <div className='bismillah text-center flex justify-center'> ﷽</div>
  );
}

export default function Home() {
  const [quranData, setQuranData] = useState<QuranData | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [inputPage, setInputPage] = useState('1');
  const [style, setStyle] = useState('hafs');
  const [font, setFont] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    async function fetchQuranData() {
      const response = await fetch(`/quran-pages/enhanced_data_${style}.json`);
      console.log(`/quran-pages/enhanced_data_${style}.json`);
      const data = await response.json();
      setQuranData(data);
    }
    fetchQuranData();
  }, [style, font]);

  const pageContent = quranData?.pages[pageNumber.toString()];

  const changePage = (delta: number) => {
    const newPage = pageNumber + delta;
    if (newPage > 0 && newPage <= 604) {
      setPageNumber(newPage);
      setInputPage(String(newPage));
    }
  };

  const loadPage = () => {
    const newPage = parseInt(inputPage, 10);
    if (!isNaN(newPage) && newPage > 0 && newPage <= 604) {
      setPageNumber(newPage);
    }
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const dynamicStyles = `
    #mushaf-display .quran-line {
      font-family: ${font === '-digital-khatt' ? 'digitalkhatt' : 'me_quran'} !important;
    }
  `;

  return (
    <>
      <style>{dynamicStyles}</style>
      <div className={`${isDarkMode ? 'dark' : ''}`}>
      <main className="min-h-screen flex flex-col items-center p-2">
        <h1 id="title">Quran Mushaf Reader</h1>
        <div id="controls">
          <div className="text-center">
            <div className="mb-4">
              <label htmlFor="style-select" className="label-text">Style:</label>
              <select id="style-select" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="hafs">Hafs</option>
                <option value="hisham">Hisham</option>
                <option value="ibn-dhakwan">Ibn Dhakwan</option>
              </select>
              <label htmlFor="font-select" className="label-text">Font:</label>
              <select id="font-select" value={font} onChange={(e) => setFont(e.target.value)}>
                <option value="">Hafs</option>
                <option value="-digital-khatt">Digital Khatt</option>
              </select>
              <label htmlFor="page-input" className="label-text">Page:</label>
              <input
                id="page-input"
                type="number"
                min="1"
                max="604"
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadPage()}
              />
              <button onClick={loadPage}>Load Page</button>
              <button onClick={() => changePage(-1)} id="prev-btn">Prev Page</button>
              <button onClick={() => changePage(1)} id="next-btn">Next Page</button>
            </div>
            <div>
              <span id="currentPageInfo" className="me-2">Page: {pageNumber}</span>
              <button id="darkModeToggleBtn" onClick={toggleDarkMode} className={isDarkMode ? 'light-mode-btn' : 'dark-mode-btn'}>
                {isDarkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>
        </div>

        <div
          id="mushaf-display-container"
          className={`content-wrapper ${isDarkMode ? 'dark' : ''}`}>
          <div
            id="mushaf-display"
            className="quran-page"
            style={{
              borderImageSource: "url('/borders/quran-border.png')",
              backgroundColor: isDarkMode ? '#222' : '#f8f0da',
              color: isDarkMode ? '#eee' : '#333'
            }}
          >
            {pageContent ? (
              <div className="quran-page-content">
                {pageContent.lines.map((line, index) => {
                  if (line.isIndicator) {
                    // Render indicators (surah_name, basmallah)
                    if (line.lineType === 'surah_name' && line.surahNumber) {
                      return <SurahHeader key={index} surahNumber={line.surahNumber} />;
                    } else if (line.lineType === 'basmallah') {
                      return <Basmallah key={index} />;
                    }
                    return null;
                  } else {
                    // Render ayah lines with proper word structure
                    const parsedWords = parseAyahText(line.text, line.wordRange);
                    const alignmentClass = line.isCentered 
                      ? 'text-center flex justify-center' 
                      : 'flex justify-between';
                    
                    return (
                      <p
                        key={index}
                        className={`quran-line ${alignmentClass}`}
                        data-pag={pageNumber}
                        data-line={line.lineNumber}
                        data-first-word-id={line.wordRange.first}
                        data-last-word-id={line.wordRange.last}
                        id={`line-${pageNumber}-${line.lineNumber}`}
                      >
                        {parsedWords.map((wordData, wordIndex) => {
                          if (wordData.isAyahEnd && wordData.ayahNumber) {
                            // Render ayah number marker
                            return (
                              <span key={wordIndex} className="arabic-num-marker">
                                {wordData.ayahNumber}
                              </span>
                            );
                          } else if (wordData.word) {
                            // Render regular word with proper ayah class
                            return (
                              <span key={wordIndex} className={`word ${wordData.ayahClass}`}>
                                <span className="text">{wordData.word}</span>
                              </span>
                            );
                          }
                          return null;
                        })}
                      </p>
                    );
                  }
                })}
              </div>
            ) : (
              <p className="text-center">Loading Quran page...</p>
            )}
          </div>
        </div>
        <div className="text-center mt-2 font-bold">
          <p>{pageNumber}</p>
        </div>
      </main>
    </div>
    </>
  );
}

