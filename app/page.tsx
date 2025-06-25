"use client";

import { useState, useEffect } from 'react';

// Define the types for our data
interface PageContent {
  html_content: string;
}

interface QuranData {
  [pageNumber: string]: PageContent;
}

export default function Home() {
  const [quranData, setQuranData] = useState<QuranData>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [inputPage, setInputPage] = useState('1');
  const [style, setStyle] = useState('hafs-digital-khatt');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    async function fetchQuranData() {
      const response = await fetch(`/quran-pages/data_${style}.json`);
      const data = await response.json();
      setQuranData(data.pages);
    }
    fetchQuranData();
  }, [style]);

  const pageContent = quranData[pageNumber];

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

  return (
    <div className={`${isDarkMode ? 'dark' : ''} font-me_quran`}>
      <main className="min-h-screen flex flex-col items-center p-2">
        <h1 id="title">Quran Mushaf Reader</h1>
        <div id="controls">
          <div className="text-center">
            <div className="mb-4">
              <label htmlFor="style-select" className="label-text">Style:</label>
              <select id="style-select" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="hafs-digital-khatt">Hafs Digital Khatt</option>
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
              <div
                dangerouslySetInnerHTML={{ __html: pageContent.html_content }}
              />
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
  );
}

