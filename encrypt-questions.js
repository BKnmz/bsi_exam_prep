// One-time script: extract questions from PDF and encrypt them.
// Run: node encrypt-questions.js <password>
// Output: questions.enc.json (commit this; never commit the PDF)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const PDF_PATH = path.join(__dirname, '..', '01_BSI_Prüfung_Vorbereitung.pdf');
const OUT_PATH = path.join(__dirname, 'questions.enc.json');
const PASSWORD = process.argv[2];

if (!PASSWORD) {
  console.error('Usage: node encrypt-questions.js <password>');
  process.exit(1);
}

async function extractQuestions() {
  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;
  const questions = [];

  // Page 1 = cover (skip). Even pages = questions, odd pages = answers.
  for (let i = 2; i <= numPages - 1; i += 2) {
    const qPage = await doc.getPage(i);
    const aPage = await doc.getPage(i + 1);

    const qContent = await qPage.getTextContent();
    const aContent = await aPage.getTextContent();

    const qItems = qContent.items;
    const aItems = aContent.items;

    // Detect correct answer via font 'f3' (same logic as app.js)
    let correctLetter = null;
    let currentLetter = null;

    for (const item of aItems) {
      const str = item.str.trim();
      const match = str.match(/^([A-D])\./);
      if (match) currentLetter = match[1];
      if (item.fontName && item.fontName.endsWith('f3') && currentLetter) {
        correctLetter = currentLetter;
      }
    }

    if (!correctLetter) {
      let lastSeenLetter = null;
      for (const item of aItems) {
        const str = item.str.trim();
        const match = str.match(/^([A-D])\./);
        if (match) lastSeenLetter = match[1];
        if (item.fontName && item.fontName.endsWith('f3') && lastSeenLetter) {
          correctLetter = lastSeenLetter;
          break;
        }
      }
    }

    if (!correctLetter) correctLetter = 'A';

    // Parse question stem and options (same logic as app.js)
    let stem = '';
    const options = { A: '', B: '', C: '', D: '' };
    let currentOpt = null;

    for (const item of qItems) {
      const str = item.str;
      const trimmed = str.trim();

      if (trimmed.startsWith('Frage')) {
        const headerMatch = trimmed.match(/^Frage\s+\d+/);
        if (headerMatch) continue;
      }

      const match = trimmed.match(/^([A-D])\./);
      if (match) {
        currentOpt = match[1];
        options[currentOpt] = trimmed.substring(2).trim();
      } else if (currentOpt) {
        options[currentOpt] += ' ' + str;
      } else {
        stem += ' ' + str;
      }
    }

    stem = stem.trim().replace(/\s+/g, ' ');
    for (const key in options) {
      options[key] = options[key].trim().replace(/\s+/g, ' ');
    }

    questions.push({
      id: i / 2,
      question: stem,
      options: [
        { letter: 'A', text: options.A },
        { letter: 'B', text: options.B },
        { letter: 'C', text: options.C },
        { letter: 'D', text: options.D }
      ],
      correctAnswer: correctLetter
    });
  }

  return questions;
}

async function encryptData(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: enc.toString('hex')
  };
}

(async () => {
  console.log('Reading PDF:', PDF_PATH);
  if (!fs.existsSync(PDF_PATH)) {
    console.error('ERROR: PDF not found at', PDF_PATH);
    process.exit(1);
  }

  console.log('Extracting questions...');
  const questions = await extractQuestions();
  console.log(`Extracted ${questions.length} questions.`);

  if (questions.length < 100) {
    console.error('ERROR: Too few questions extracted. Check PDF parsing.');
    process.exit(1);
  }

  const payload = JSON.stringify(questions);
  const encrypted = await encryptData(payload, PASSWORD);
  fs.writeFileSync(OUT_PATH, JSON.stringify(encrypted, null, 2));
  console.log('Saved encrypted questions to', OUT_PATH);
  console.log('Done. Share the password out-of-band with your users.');
})();
