# BSI Prüfungsvorbereitung

Offline exam preparation app for BSI certification (TIRA). 170 questions, mock tests, timed exam simulation.

![App Screenshot](screenshot.png)

## Requirements

- [Node.js](https://nodejs.org/) (v16+)

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/BKnmz/bsi_exam_prep.git
cd bsi_exam_prep

# 2. Install dependencies
npm install
```

## Run

**Windows:** Double-click `start.bat`

**Or manually:**
```bash
node server.js
```
Then open [http://localhost:12121](http://localhost:12121) in your browser.

> Works fully offline — no internet connection required.

## Features

- **Mock-Test** — 20 random questions with instant feedback
- **TIRA-Prüfung** — 50 questions, 50-minute timer, exam simulation
- **Dashboard** — tracks score history and coverage stats
- Pass threshold: 65%
