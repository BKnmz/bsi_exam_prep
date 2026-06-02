// app.js – BSI Prüfungsvorbereitung (Fixed, Premium, Robust Parser & Glassmorphism Router)
(() => {
  const PDF_URL = "./01_BSI_Prüfung_Vorbereitung.pdf";
  const TOTAL_EXAM_QUESTIONS = 50;
  const TOTAL_MOCK_QUESTIONS = 20;
  const EXAM_TIME_MIN = 50;
  const PASS_THRESHOLD = 65; // percent
  const READINESS_COVERAGE_THRESHOLD = 0.75;
  const READINESS_SCORE_THRESHOLD = 65;

  // ---------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------
  let pdfDoc = null;
  let fullQaPairs = [];      // Master pool – never mutated after loading
  let qaPairs = [];          // Active session questions (subset of fullQaPairs)
  let currentMode = null;    // "mock" | "exam"
  let currentIndex = 0;
  let selectedAnswers = [];  // TIRA Exam state: Array of { pair, selectedLetter, correct }
  let mockAnswers = [];      // Mock Mode: reset each session
  let timerId = null;
  let remainingSec = EXAM_TIME_MIN * 60;
  let isAnswered = false;

  const storageKey = "bsi_progress_modern";
  const loadProgress = () => JSON.parse(localStorage.getItem(storageKey) || "{}");
  const saveProgress = (obj) => localStorage.setItem(storageKey, JSON.stringify(obj));

  function updateCoverage(questionId, isCorrect) {
    const prog = loadProgress();
    prog.coverage = prog.coverage || {};
    const entry = prog.coverage[questionId] || { attempts: 0, correct: 0, incorrect: 0 };
    entry.attempts++;
    if (isCorrect) entry.correct++; else entry.incorrect++;
    prog.coverage[questionId] = entry;
    saveProgress(prog);
  }

  function pushMockResult(correctCount, total) {
    const prog = loadProgress();
    prog.mockHistory = prog.mockHistory || [];
    prog.mockHistory.push({
      date: new Date().toISOString(),
      correct: correctCount,
      total: total,
      percent: Math.round((correctCount / total) * 100)
    });
    if (prog.mockHistory.length > 20) prog.mockHistory.shift();
    saveProgress(prog);
  }

  // Helper selectors
  const $ = (id) => document.getElementById(id);
  const show = (el) => el && el.classList.add("active");
  const hide = (el) => el && el.classList.remove("active");
  const setText = (el, txt) => el && (el.textContent = txt);

  // ---------------------------------------------------------------
  // Router / Section switcher (NO DOM DESTRUCTION)
  // ---------------------------------------------------------------
  function switchSection(name) {
    document.querySelectorAll("main > section").forEach((sec) => sec.classList.remove("active"));
    const target = $(`${name}Section`);
    if (target) target.classList.add("active");

    document.querySelectorAll("nav .nav-btn").forEach((btn) => btn.classList.remove("active"));
    const btn = $(`${name}Btn`);
    if (btn) btn.classList.add("active");

    if (name === "home") {
      refreshDashboardStats();
    }
  }

  // ---------------------------------------------------------------
  // Dashboard / Statistics Loader
  // ---------------------------------------------------------------
  function refreshDashboardStats() {
    const prog = loadProgress();

    // Total Questions
    const totalQEl = $("statTotalQuestions");
    if (totalQEl) {
      totalQEl.textContent = fullQaPairs.length > 0 ? fullQaPairs.length : "--";
    }

    // Last Exam Score & Status
    const scoreEl = $("statLastExamScore");
    const descEl = $("statLastExamStatus");

    if (scoreEl && descEl) {
      if (prog.lastExam) {
        const exam = prog.lastExam;
        scoreEl.textContent = `${exam.correct}/${exam.total}`;

        if (exam.passed) {
          scoreEl.className = "stat-value passed";
          descEl.innerHTML = `✅ <b>Bestanden</b> (${exam.percent}%)`;
        } else {
          scoreEl.className = "stat-value failed";
          descEl.innerHTML = `❌ <b>Nicht bestanden</b> (${exam.percent}%)`;
        }
      } else {
        scoreEl.textContent = "--";
        scoreEl.className = "stat-value";
        descEl.textContent = "Noch kein Test absolviert";
      }
    }

    // Coverage Stats
    const covered = Object.keys(prog.coverage || {}).length;
    const total = fullQaPairs.length || 0;
    const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;
    const coverageEl = $("statCoverage");
    const coverageDescEl = $("statCoverageDesc");
    if (coverageEl) coverageEl.textContent = total > 0 ? `${covered}/${total}` : "--";
    if (coverageDescEl) coverageDescEl.textContent = total > 0 ? `${coveragePct}% des Katalogs geübt` : "Noch keine Fragen geübt";

    // Mock History Stats
    const mockHistory = prog.mockHistory || [];
    const mockCountEl = $("statMockCount");
    const mockAvgEl = $("statMockAvg");
    if (mockCountEl) mockCountEl.textContent = mockHistory.length > 0 ? mockHistory.length : "--";
    if (mockAvgEl) {
      if (mockHistory.length > 0) {
        const avg = Math.round(mockHistory.reduce((s, r) => s + r.percent, 0) / mockHistory.length);
        mockAvgEl.textContent = `Ø Score: ${avg}%`;
      } else {
        mockAvgEl.textContent = "Noch keine Mock-Tests";
      }
    }
  }

  // ---------------------------------------------------------------
  // Robust PDF.js Parser (Matches Questions and Extracts Correct Option by Font Style)
  // ---------------------------------------------------------------
  async function loadPDF() {
    const overlay = $("loadingOverlay");

    try {
      const loadingTask = pdfjsLib.getDocument(PDF_URL);
      pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;

      qaPairs = [];

      // Page 1 is cover page (skip). Questions start on page 2 (even) and answers are on page 3 (odd).
      for (let i = 2; i <= numPages - 1; i += 2) {
        const qPage = await pdfDoc.getPage(i);
        const aPage = await pdfDoc.getPage(i + 1);

        const qContent = await qPage.getTextContent();
        const aContent = await aPage.getTextContent();

        const qItems = qContent.items;
        const aItems = aContent.items;

        // Identify correct answer by font style 'g_d1_f3'
        let correctLetter = null;
        let currentLetter = null;

        for (const item of aItems) {
          const str = item.str.trim();
          const match = str.match(/^([A-D])\./);
          if (match) {
            currentLetter = match[1];
          }
          if (item.fontName && item.fontName.endsWith('f3') && currentLetter) {
            correctLetter = currentLetter;
          }
        }

        if (!correctLetter) {
          let lastSeenLetter = null;
          for (const item of aItems) {
            const str = item.str.trim();
            const match = str.match(/^([A-D])\./);
            if (match) {
              lastSeenLetter = match[1];
            }
            if (item.fontName && item.fontName.endsWith('f3') && lastSeenLetter) {
              correctLetter = lastSeenLetter;
              break;
            }
          }
        }

        if (!correctLetter) {
          correctLetter = "A";
        }

        // Parse Question and Options text
        let stem = "";
        const options = { 'A': '', 'B': '', 'C': '', 'D': '' };
        let currentOpt = null;

        for (const item of qItems) {
          const str = item.str;
          const trimmed = str.trim();

          if (trimmed.startsWith("Frage")) {
            const headerMatch = trimmed.match(/^Frage\s+\d+/);
            if (headerMatch) continue;
          }

          const match = trimmed.match(/^([A-D])\./);
          if (match) {
            currentOpt = match[1];
            options[currentOpt] = trimmed.substring(2).trim();
          } else if (currentOpt) {
            options[currentOpt] += " " + str;
          } else {
            stem += " " + str;
          }
        }

        stem = stem.trim().replace(/\s+/g, ' ');
        for (const key in options) {
          options[key] = options[key].trim().replace(/\s+/g, ' ');
        }

        qaPairs.push({
          id: i / 2,
          question: stem,
          options: [
            { letter: 'A', text: options['A'] },
            { letter: 'B', text: options['B'] },
            { letter: 'C', text: options['C'] },
            { letter: 'D', text: options['D'] }
          ],
          correctAnswer: correctLetter
        });
      }

      // Freeze the master pool — never mutated again
      fullQaPairs = [...qaPairs];

      const prog = loadProgress();
      prog.totalQuestions = fullQaPairs.length;
      saveProgress(prog);

      if (overlay) {
        overlay.classList.add("hidden");
      }
      switchSection("home");

    } catch (error) {
      console.error("PDF Parsing Failure:", error);
      const loadingSubtext = document.querySelector(".loading-subtext");
      const loadingText = document.querySelector(".loading-text");
      if (loadingText) {
        loadingText.textContent = "Fehler beim Laden";
        loadingText.style.background = "linear-gradient(135deg, #ff4444 0%, #ff8888 100%)";
        loadingText.style.webkitBackgroundClip = "text";
      }
      if (loadingSubtext) {
        loadingSubtext.innerHTML = `Die Datei <b>01_BSI_Prüfung_Vorbereitung.pdf</b> konnte nicht analysiert werden.<br>
        Bitte stelle sicher, dass sie im gleichen Ordner wie <i>index.html</i> liegt.`;
        loadingSubtext.style.color = "#ef4444";
      }
    }
  }

  // ---------------------------------------------------------------
  // Question Rendering & Options Visual State Toggling
  // ---------------------------------------------------------------
  function renderQuestion(pair) {
    isAnswered = false;

    const activeSection = document.querySelector("main > section.active");
    if (!activeSection) return;

    const container = activeSection.querySelector(".question-container");
    const explanationContainer = activeSection.querySelector(".explanation-container");
    const nextBtn = activeSection.querySelector(".primary-btn");

    if (!container) return;

    container.innerHTML = "";
    if (explanationContainer) {
      explanationContainer.innerHTML = "";
      explanationContainer.style.display = "none";
    }
    if (nextBtn) {
      nextBtn.disabled = true;
      if (currentMode === "exam") {
        nextBtn.textContent = "Antwort bestätigen 🗸";
      } else {
        nextBtn.textContent = "Nächste Frage →";
      }
    }

    const tmpl = $("questionTemplate");
    const clone = tmpl.content.cloneNode(true);
    const textEl = clone.querySelector(".question-text");
    textEl.textContent = `${currentIndex + 1}. ${pair.question}`;

    const ul = clone.querySelector(".options-list");
    pair.options.forEach((opt) => {
      if (!opt.text) return;

      const li = document.createElement("li");

      const spanPrefix = document.createElement("span");
      spanPrefix.className = "option-prefix";
      spanPrefix.textContent = `${opt.letter}.`;

      const spanText = document.createElement("span");
      spanText.className = "option-text";
      spanText.textContent = opt.text;

      li.appendChild(spanPrefix);
      li.appendChild(spanText);

      li.addEventListener("click", () => handleOptionClick(li, opt.letter, pair, activeSection));
      ul.appendChild(li);
    });

    container.appendChild(clone);
  }

  function handleOptionClick(selectedLi, selectedLetter, pair, activeSection) {
    if (isAnswered) return;
    isAnswered = true;

    const listItems = activeSection.querySelectorAll(".options-list li");
    const nextBtn = activeSection.querySelector(".primary-btn");
    const explanationContainer = activeSection.querySelector(".explanation-container");

    const correctLetter = pair.correctAnswer;
    const isCorrect = selectedLetter === correctLetter;

    listItems.forEach((li) => {
      li.classList.add("disabled");
      const optLetter = li.querySelector(".option-prefix").textContent.replace(".", "");

      if (optLetter === correctLetter) {
        li.classList.add("correct");
      } else if (optLetter === selectedLetter) {
        li.classList.add("incorrect");
      } else {
        li.classList.add("unselected-muted");
      }
    });

    if (currentMode === "exam") {
      selectedAnswers[currentIndex] = {
        pair: pair,
        selectedLetter: selectedLetter,
        correct: isCorrect
      };
    } else if (currentMode === "mock") {
      updateCoverage(pair.id, isCorrect);
      mockAnswers.push({
        pair: pair,
        selectedLetter: selectedLetter,
        correct: isCorrect
      });
    }

    if (explanationContainer) {
      explanationContainer.style.display = "block";

      const explanationCard = document.createElement("div");
      explanationCard.className = `explanation-card ${isCorrect ? 'correct-feedback' : 'incorrect-feedback'}`;

      const title = document.createElement("div");
      title.className = "explanation-title";
      title.innerHTML = isCorrect ? "✅ Richtig!" : "❌ Nicht korrekt.";

      const text = document.createElement("div");
      text.className = "explanation-text";

      const correctOptText = pair.options.find(o => o.letter === correctLetter)?.text || "";
      text.innerHTML = `Die richtige Antwort ist <b>${correctLetter}</b>:<br><i>${correctOptText}</i>`;

      explanationCard.appendChild(title);
      explanationCard.appendChild(text);
      explanationContainer.appendChild(explanationCard);
    }

    if (nextBtn) {
      nextBtn.disabled = false;
      if (currentMode === "exam" && currentIndex === TOTAL_EXAM_QUESTIONS - 1) {
        nextBtn.textContent = "Prüfung beenden 🏆";
      }
    }
  }

  function handleNextClick() {
    currentIndex++;

    if (currentMode === "exam") {
      if (currentIndex >= TOTAL_EXAM_QUESTIONS) {
        finishExam();
        return;
      }
    } else if (currentMode === "mock") {
      if (currentIndex >= qaPairs.length) {
        showMockFinished();
        return;
      }
    }

    renderQuestion(qaPairs[currentIndex]);
    updateQuizProgress();
  }

  // ---------------------------------------------------------------
  // Quiz progress bars
  // ---------------------------------------------------------------
  function updateQuizProgress() {
    const activeSection = document.querySelector("main > section.active");
    if (!activeSection) return;

    const total = currentMode === "exam" ? TOTAL_EXAM_QUESTIONS : qaPairs.length;
    const progressFill = activeSection.querySelector(".progress-bar-fill");
    const progressCount = activeSection.querySelector(".progress-count");
    const progressPct = activeSection.querySelector(".progress-pct");

    const percentage = Math.round((currentIndex / total) * 100);

    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressCount) progressCount.textContent = `Frage ${currentIndex + 1} von ${total}`;
    if (progressPct) progressPct.textContent = `${percentage}%`;
  }

  // ---------------------------------------------------------------
  // Timer (TIRA Mode)
  // ---------------------------------------------------------------
  function startTimer() {
    remainingSec = EXAM_TIME_MIN * 60;
    const timerEl = $("timer");

    if (timerEl) {
      timerEl.textContent = `⏱️ ${formatTime(remainingSec)}`;
      timerEl.classList.remove("hidden");
    }

    if (timerId) clearInterval(timerId);

    timerId = setInterval(() => {
      remainingSec--;

      if (timerEl) {
        timerEl.textContent = `⏱️ ${formatTime(remainingSec)}`;
        if (remainingSec <= 300) {
          timerEl.style.color = "hsl(350, 80%, 60%)";
          timerEl.style.background = "rgba(239, 68, 68, 0.12)";
        } else {
          timerEl.style.color = "";
          timerEl.style.background = "";
        }
      }

      if (remainingSec <= 0) {
        clearInterval(timerId);
        finishExam();
      }
    }, 1000);
  }

  function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  // ---------------------------------------------------------------
  // Finish and Results Modals
  // ---------------------------------------------------------------
  function finishExam() {
    if (timerId) clearInterval(timerId);

    const correctCount = selectedAnswers.filter(a => a && a.correct).length;
    const percent = Math.round((correctCount / TOTAL_EXAM_QUESTIONS) * 100);
    const passed = percent >= PASS_THRESHOLD;

    const modal = $("resultModal");
    const title = $("resultTitle");
    const text = $("resultText");
    const badge = $("resultBadge");

    if (passed) {
      badge.textContent = "🏆";
      title.textContent = "Bestanden!";
      title.className = "result-heading passed";
    } else {
      badge.textContent = "📈";
      title.textContent = "Nicht bestanden";
      title.className = "result-heading failed";
    }

    text.innerHTML = `Du hast <b>${correctCount}</b> von <b>${TOTAL_EXAM_QUESTIONS}</b> Fragen richtig beantwortet (<b>${percent}%</b>).<br>Erforderlich: ${PASS_THRESHOLD}%`;

    const prog = loadProgress();
    prog.lastExam = {
      correct: correctCount,
      total: TOTAL_EXAM_QUESTIONS,
      percent: percent,
      passed: passed,
      answers: selectedAnswers
    };
    saveProgress(prog);

    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  function showMockFinished() {
    const correctCount = mockAnswers.filter(a => a && a.correct).length;
    const total = mockAnswers.length;
    const percent = Math.round((correctCount / total) * 100);

    const modal = $("resultModal");
    const title = $("resultTitle");
    const text = $("resultText");
    const badge = $("resultBadge");

    badge.textContent = "🎓";
    title.textContent = "Mock-Test beendet!";
    title.className = "result-heading passed";

    text.innerHTML = `Du hast <b>${correctCount}</b> von <b>${total}</b> Fragen richtig beantwortet (<b>${percent}%</b>).`;

    pushMockResult(correctCount, total);

    const reviewBtn = $("reviewBtn");
    if (reviewBtn) reviewBtn.style.display = "none";

    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  // ---------------------------------------------------------------
  // Review Mode Panel (Exam Review Dashboard)
  // ---------------------------------------------------------------
  function startReviewMode() {
    const modal = $("resultModal");
    if (modal) modal.classList.add("hidden");

    switchSection("review");

    const reviewList = $("reviewList");
    if (!reviewList) return;

    reviewList.innerHTML = "";

    const prog = loadProgress();
    const examAnswers = prog.lastExam?.answers || selectedAnswers;

    if (!examAnswers || examAnswers.length === 0) {
      reviewList.innerHTML = "<p class='subtitle'>Keine Prüfungsdaten zum Reviewen verfügbar.</p>";
      return;
    }

    examAnswers.forEach((ans, idx) => {
      const { pair, selectedLetter, correct } = ans;

      const item = document.createElement("div");
      item.className = "review-item";

      const header = document.createElement("div");
      header.className = "review-item-header";

      const num = document.createElement("span");
      num.className = "review-num";
      num.textContent = `Frage ${idx + 1} von ${TOTAL_EXAM_QUESTIONS}`;

      const status = document.createElement("span");
      status.className = `review-status ${correct ? 'correct' : 'incorrect'}`;
      status.textContent = correct ? "Richtig" : "Falsch";

      header.appendChild(num);
      header.appendChild(status);
      item.appendChild(header);

      const stem = document.createElement("div");
      stem.className = "review-question";
      stem.textContent = pair.question;
      item.appendChild(stem);

      const optionsUl = document.createElement("ul");
      optionsUl.className = "review-options";

      pair.options.forEach(opt => {
        if (!opt.text) return;

        const li = document.createElement("li");
        li.textContent = `${opt.letter}. ${opt.text}`;

        if (opt.letter === selectedLetter && correct) {
          li.className = "user-choice-correct";
        } else if (opt.letter === selectedLetter && !correct) {
          li.className = "user-choice-incorrect";
        } else if (opt.letter === pair.correctAnswer) {
          li.className = "correct-answer-missed";
        } else {
          li.className = "standard-opt";
        }

        optionsUl.appendChild(li);
      });

      item.appendChild(optionsUl);
      reviewList.appendChild(item);
    });
  }

  // ---------------------------------------------------------------
  // Readiness Check Modal (shown before TIRA exam)
  // ---------------------------------------------------------------
  function showReadinessModal() {
    const prog = loadProgress();
    const covered = Object.keys(prog.coverage || {}).length;
    const total = fullQaPairs.length || 1;
    const coveragePct = Math.round((covered / total) * 100);
    const mockHistory = prog.mockHistory || [];
    const avgScore = mockHistory.length > 0
      ? Math.round(mockHistory.reduce((s, r) => s + r.percent, 0) / mockHistory.length)
      : 0;

    const isReady = coveragePct >= Math.round(READINESS_COVERAGE_THRESHOLD * 100)
      && mockHistory.length > 0
      && avgScore >= READINESS_SCORE_THRESHOLD;

    const modal = $("readinessModal");
    const titleEl = $("readinessTitle");
    const statsEl = $("readinessStats");
    const msgEl = $("readinessMsg");

    if (titleEl) titleEl.textContent = isReady ? "✅ Du bist bereit!" : "📈 Bereit für die TIRA?";
    if (statsEl) statsEl.innerHTML = `
      <div class="readiness-row"><span>Abdeckung</span><b>${covered}/${total} (${coveragePct}%)</b></div>
      <div class="readiness-row"><span>Mock-Tests absolviert</span><b>${mockHistory.length}</b></div>
      <div class="readiness-row"><span>Ø Mock-Score</span><b>${mockHistory.length > 0 ? avgScore + '%' : '--'}</b></div>
    `;
    if (msgEl) msgEl.textContent = isReady
      ? "Deine Vorbereitung sieht gut aus. Viel Erfolg bei der Prüfung!"
      : `Empfehlung: Weiter üben (Ziel: ${Math.round(READINESS_COVERAGE_THRESHOLD * 100)}% Abdeckung, Ø ${READINESS_SCORE_THRESHOLD}% Score).`;

    if (modal) modal.classList.remove("hidden");
  }

  // ---------------------------------------------------------------
  // Quiz Startup Functions
  // ---------------------------------------------------------------
  function startMock() {
    currentMode = "mock";
    mockAnswers = [];
    switchSection("mock");
    currentIndex = 0;

    // Always sample from full pool — fresh random 20 every run
    qaPairs = [...fullQaPairs].sort(() => Math.random() - 0.5).slice(0, TOTAL_MOCK_QUESTIONS);

    const mockNext = $("mockNextBtn");
    if (mockNext) {
      mockNext.onclick = handleNextClick;
    }

    renderQuestion(qaPairs[currentIndex]);
    updateQuizProgress();
  }

  function startExam() {
    currentMode = "exam";
    switchSection("tira");
    currentIndex = 0;
    selectedAnswers = new Array(TOTAL_EXAM_QUESTIONS);

    // Always sample from full pool — fresh random 50 every run
    qaPairs = [...fullQaPairs].sort(() => Math.random() - 0.5).slice(0, TOTAL_EXAM_QUESTIONS);

    const tiraNext = $("tiraNextBtn");
    if (tiraNext) {
      tiraNext.onclick = handleNextClick;
    }

    renderQuestion(qaPairs[currentIndex]);
    startTimer();
    updateQuizProgress();
  }

  // ---------------------------------------------------------------
  // Application Entry Point / DOM Loaded
  // ---------------------------------------------------------------
  window.addEventListener("DOMContentLoaded", () => {
    const homeBtn = $("homeBtn");
    const mockBtn = $("mockBtn");
    const tiraBtn = $("tiraBtn");

    if (homeBtn) homeBtn.addEventListener("click", () => switchSection("home"));
    if (mockBtn) mockBtn.addEventListener("click", startMock);
    if (tiraBtn) tiraBtn.addEventListener("click", showReadinessModal);

    // Dashboard CTA triggers
    const actMock = $("actionMock");
    const actTira = $("actionTira");
    if (actMock) actMock.addEventListener("click", startMock);
    if (actTira) actTira.addEventListener("click", showReadinessModal);

    // Readiness modal handlers
    const readinessStartBtn = $("readinessStartBtn");
    const readinessMockBtn = $("readinessMockBtn");
    if (readinessStartBtn) readinessStartBtn.addEventListener("click", () => {
      $("readinessModal").classList.add("hidden");
      startExam();
    });
    if (readinessMockBtn) readinessMockBtn.addEventListener("click", () => {
      $("readinessModal").classList.add("hidden");
      startMock();
    });

    // Modal action handlers
    const closeModal = $("closeModal");
    const closeModalSec = $("closeModalSecondary");
    const reviewBtn = $("reviewBtn");
    const backHomeBtn = $("backToHomeBtn");

    const modalClose = () => {
      const modal = $("resultModal");
      if (modal) modal.classList.add("hidden");
      // Restore review button visibility for next exam
      if (reviewBtn) reviewBtn.style.display = "";
      switchSection("home");
    };

    if (closeModal) closeModal.addEventListener("click", modalClose);
    if (closeModalSec) closeModalSec.addEventListener("click", modalClose);
    if (reviewBtn) reviewBtn.addEventListener("click", startReviewMode);
    if (backHomeBtn) backHomeBtn.addEventListener("click", () => switchSection("home"));

    // Local PDF.js (offline-capable)
    const script = document.createElement("script");
    script.src = "./pdf.min.js";
    script.onload = async () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";
      await loadPDF();
    };
    document.head.appendChild(script);
  });
})();
