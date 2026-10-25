const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('01 Test modules share one attempt ID', () => {
  const listeningInstructions = readFile('ielts-listening-instructions.html');
  const readingScorer = readFile('reading-score.js');
  const writingScorer = readFile('writing-score.js');
  const writingInstructions = readFile('ielts-writing.html');

  assert.match(listeningInstructions, /ieltsMockAttemptId__' \+ context, attemptId/);
  assert.match(readingScorer, /UNIFIED_ATTEMPT_ID_KEY/);
  assert.match(writingScorer, /unifiedAttemptIdKey/);
  assert.match(writingScorer, /SHARED_ATTEMPT_ID_KEY/);
  assert.match(writingInstructions, /if \(testMode !== 'free'\)/);
});

test('01 Test Listening ends after 24 minutes', () => {
  const listeningInstructions = readFile('ielts-listening-instructions.html');
  const listeningTest = readFile('ielts-listening-test.html');

  assert.match(listeningInstructions, /Time: Approximately 24 minutes/);
  assert.match(listeningInstructions, /ieltsListeningStartedAt__' \+ context, startedAt/);
  assert.match(listeningTest, /var totalSeconds = 24 \* 60/);
  assert.match(listeningTest, /var timerStorageKey = 'ieltsListeningStartedAt__' \+ getListeningAttemptContext\(\)/);
  assert.match(listeningTest, /id="listening-timer"/);
  assert.match(listeningTest, /window\.location\.replace\('ielts-listening-ended\.html'\)/);
});

test('Reading custom answer controls restore and autosave', () => {
  const scorer = readFile('reading-score.js');

  assert.match(scorer, /restoreCustomAnswers/);
  assert.match(scorer, /reading-paragraphDropSlot/);
  assert.match(scorer, /reading-chooseTwo-input/);
  assert.match(scorer, /reading-chooseTwo22-input/);
  assert.match(scorer, /reading-dndBlankSlot/);
  assert.match(scorer, /document\.addEventListener\('dragend'/);
});

test('Every Reading test and result page loads the current scorer', () => {
  const files = [
    'ielts-reading-ended.html',
    'ielts-reading-ended-basic-paper1.html',
    'ielts-reading-test.html',
    'ielts-reading-test-basic-paper1.html',
    'ielts-reading-test-lite-paper1.html',
    'ielts-reading-test-part2.html',
    'ielts-reading-test-part2-basic-paper1.html',
    'ielts-reading-test-part2-lite-paper1.html',
    'ielts-reading-test-part3.html',
    'ielts-reading-test-part3-basic-paper1.html',
    'ielts-reading-test-part3-lite-paper1.html',
  ];

  for (const file of files) {
    assert.match(readFile(file), /reading-score\.js\?v=20261015-2/);
  }
});

test('Writing restores drafts only for the current session', () => {
  const scorer = readFile('writing-score.js');

  assert.match(scorer, /DRAFT_SESSION_KEY/);
  assert.match(scorer, /initializeCurrentDraftSession/);
  assert.match(scorer, /activeSessionId === sessionId/);
  assert.match(scorer, /safeRemoveStorage\(scopedKey\('ieltsWritingAnswersV1'\)\)/);
});

test('Writing answers are retained and released after 12 hours', () => {
  const submissionHandler = readFile(path.join('api', 'users', 'submit-writing.js'));
  const portalOverview = readFile(path.join('api', 'users', 'live-overview.js'));

  assert.match(submissionHandler, /WRITING_RELEASE_DELAY_MS = 12 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(submissionHandler, /writing-result-ignored/);
  assert.match(submissionHandler, /studentAnswers:\s*\{\s*task1: task1Answer,\s*task2: task2Answer,/);
  assert.match(submissionHandler, /releaseAt: releaseAtIso/);
  assert.match(portalOverview, /return nowMs >= releaseAtMs/);
});

test('Approved Writing scores are released to the student portal', () => {
  const resultsHandler = readFile(path.join('api', 'admin', 'results.js'));
  const portalOverview = readFile(path.join('api', 'users', 'live-overview.js'));
  const directorPanel = readFile('director-panel.html');

  assert.match(resultsHandler, /action \|\| ''\)\.trim\(\) === 'approve-writing'/);
  assert.match(resultsHandler, /moderationStatus: 'approved'/);
  assert.match(portalOverview, /moderationStatus.*approved/);
  assert.match(directorPanel, /Approve and publish/);
});

test('Listening accepts the corrected tour answers', () => {
  const handler = readFile(path.join('api', 'users', 'submit-listening.js'));

  assert.match(handler, /21: \['G', 'university tour'\]/);
  assert.match(handler, /22: \['E', 'library tour'\]/);
  assert.match(handler, /23: \['C', 'computer lab visit'\]/);
  assert.match(handler, /24: \['A', 'bbq'\]/);
});

test('Test portal permits five paid retakes per test', () => {
  const dashboard = readFile(path.join('student-portal-next', 'src', 'app', 'dashboard', 'page.tsx'));
  const paymentHandler = readFile(path.join('api', 'payments', 'create-payhere-order.js'));
  const retakeTokenHandler = readFile(path.join('api', 'retake-tokens', 'redeem.js'));
  const store = readFile(path.join('api', '_store.js'));

  assert.match(dashboard, /MAX_PAID_RETAKES_PER_TEST = 5/);
  assert.match(paymentHandler, /MAX_PAID_RETAKES_PER_TEST = 5/);
  assert.match(retakeTokenHandler, /MAX_PAID_RETAKES_PER_TEST = 5/);
  assert.match(store, /paidRetakes >= 5/);
  assert.match(store, /\) < 5/);
});

test('Test portal labels each booking and retake state', () => {
  const dashboard = readFile(path.join('student-portal-next', 'src', 'app', 'dashboard', 'page.tsx'));

  assert.match(dashboard, /"Test Booked"/);
  assert.match(dashboard, /"Test Completed"/);
  assert.match(dashboard, /"Retake Available"/);
  assert.match(dashboard, /"Retake Completed"/);
  assert.match(dashboard, /Retake Limit Reached/);
});

test('Test portal records paper and attempt type for Listening and Reading', () => {
  const dashboard = readFile(path.join('student-portal-next', 'src', 'app', 'dashboard', 'page.tsx'));
  const listeningEnded = readFile('ielts-listening-ended.html');
  const readingScorer = readFile('reading-score.js');
  const listeningHandler = readFile(path.join('api', 'users', 'submit-listening.js'));
  const readingHandler = readFile(path.join('api', 'users', 'submit-reading.js'));

  assert.match(dashboard, /testMode=mock&module=academic&package=Lite&paper=1&attempt=/);
  assert.match(listeningEnded, /paper: getTestPaper\(\)/);
  assert.match(listeningEnded, /attemptType: getAttemptType\(\)/);
  assert.match(readingScorer, /paper: readTestPaper\(\)/);
  assert.match(readingScorer, /attemptType: readAttemptType\(\)/);
  assert.match(listeningHandler, /paper,\s*attemptType,/);
  assert.match(readingHandler, /paper,\s*attemptType,/);
});
