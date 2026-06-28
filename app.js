const lessons = [
  { name: "Meet your debate crew", icon: "✦", title: "Debate is a conversation", idea: "Good debaters speak clearly and listen closely.", lines: [
    ["Maya", "Hi! I’m Maya. Debating isn’t about being loud or proving someone wrong."],
    ["Leo", "Wait. So I can't just say my idea again, but louder?"],
    ["Maya", "Nice try, Leo. A great debate is a conversation. You give reasons, listen closely, and respond with respect."],
    ["Leo", "That sounds harder... but also a lot more interesting. Let's learn how it works!"] ]},
  { name: "Build an opening", icon: "▦", title: "Position + reason + example", idea: "These three blocks make a strong opening statement.", lines: [
    ["Maya", "Your opening statement tells everyone what you believe and why."],
    ["Maya", "I think school should start later, because rested students can focus better. For example, it is hard to learn when you are exhausted."],
    ["Leo", "I heard three building blocks: your position, your reason, and an example."],
    ["Maya", "Exactly. Put those blocks together, and your audience can follow your thinking."] ]},
  { name: "Make a rebuttal", icon: "↪", title: "Listen, connect, respond", idea: "A rebuttal answers the other person’s actual point.", lines: [
    ["Leo", "School should not start later, because then sports practice would finish too late."],
    ["Maya", "That’s a fair concern. But schools could shorten the break before practice, so students still finish at the same time."],
    ["Leo", "You answered my actual point instead of changing the subject!"],
    ["Maya", "That is called a rebuttal: listen to a point, then explain why it may not prove the whole case."] ]},
  { name: "Ask sharp questions", icon: "⌕", title: "Cross-examination", idea: "Ask questions that test an idea or uncover missing evidence.", lines: [
    ["Maya", "Cross-examination is your chance to ask your opponent questions."],
    ["Leo", "Could I ask: What evidence shows students focus better with an early start?"],
    ["Maya", "Great question. You are checking whether my claim has strong evidence behind it."],
    ["Leo", "So good questions help us understand an argument, not embarrass the person making it."] ]},
  { name: "Finish your case", icon: "★", title: "A memorable closing", idea: "Remind us of your best reasons—don’t add a surprise argument.", lines: [
    ["Leo", "Your closing statement is the final, short reminder of why your side makes sense."],
    ["Maya", "School should start later because rest helps students focus, learn, and feel ready for the day."],
    ["Leo", "Short, clear, and no brand-new surprise arguments at the end."],
    ["Maya", "You now know every part of a debate. Ready to find your voice?"] ]}
];

let lessonIndex = 0, lineIndex = 0, soundOn = true, paused = false, utterance = null, azureAudio = null, audioUrl = null, speechRequest = null;
const audioCache = new Map();
const $ = (id) => document.getElementById(id);
const maya = $("mayaCharacter"), leo = $("leoCharacter");

function pickVoice(speaker) {
  const voices = speechSynthesis.getVoices();
  const names = speaker === "Maya"
    ? ["Ava", "Zoe", "Samantha", "Serena", "Karen", "Moira", "Zira"]
    : ["Evan", "Nathan", "Reed", "Daniel", "Tom", "Aaron", "Alex"];
  const english = voices.filter(v => v.lang.toLowerCase().startsWith("en"));
  const score = voice => {
    const name = voice.name.toLowerCase();
    const match = names.findIndex(n => name.includes(n.toLowerCase()));
    return (match < 0 ? 0 : 100 - match * 7) + (/premium|enhanced|natural|neural/.test(name) ? 35 : 0) + (voice.localService ? 3 : 0);
  };
  return english.sort((a,b) => score(b) - score(a))[0] || voices[0];
}

function renderLesson(autoSpeak = true) {
  const lesson = lessons[lessonIndex]; lineIndex = 0;
  $("lessonLabel").textContent = `Lesson ${lessonIndex + 1} of ${lessons.length}`;
  $("lessonName").textContent = lesson.name;
  $("progressFill").style.width = `${((lessonIndex + 1) / lessons.length) * 100}%`;
  $("ideaIcon").textContent = lesson.icon; $("ideaTitle").textContent = lesson.title; $("ideaText").textContent = lesson.idea;
  $("nextButton").innerHTML = lessonIndex === lessons.length - 1 ? "Finish introduction <span>→</span>" : "Continue <span>→</span>";
  showLine(autoSpeak);
}

function showLine(autoSpeak = true) {
  stopVoice();
  const [speaker, text] = lessons[lessonIndex].lines[lineIndex];
  $("speakerName").textContent = `${speaker} is speaking`;
  $("subtitle").textContent = text;
  maya.classList.toggle("active", speaker === "Maya"); leo.classList.toggle("active", speaker === "Leo");
  maya.classList.remove("speaking"); leo.classList.remove("speaking");
  $("visualIdea").classList.remove("pop"); void $("visualIdea").offsetWidth; $("visualIdea").classList.add("pop");
  paused = false; $("playIcon").textContent = "Ⅱ";
  if (autoSpeak && soundOn) speak(speaker, text);
}

function browserSpeak(speaker, text) {
  utterance = new SpeechSynthesisUtterance(text); utterance.voice = pickVoice(speaker);
  utterance.rate = speaker === "Maya" ? .9 : .96; utterance.pitch = speaker === "Maya" ? 1.03 : .94; utterance.volume = 1;
  const character = speaker === "Maya" ? maya : leo;
  utterance.onstart = () => character.classList.add("speaking");
  utterance.onend = () => { character.classList.remove("speaking"); $("playIcon").textContent = "▶"; };
  utterance.onerror = () => character.classList.remove("speaking");
  speechSynthesis.speak(utterance);
}

function getAudio(speaker, text) {
  const key = `${speaker}|${text}`;
  if (!audioCache.has(key)) {
    const request = fetchAudioWithRetry(speaker, text)
      .catch(error => { audioCache.delete(key); throw error; });
    audioCache.set(key, request);
  }
  return audioCache.get(key);
}

async function fetchAudioWithRetry(speaker, text) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("/api/speech", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({speaker,text}) });
      if (!response.ok) throw new Error(`AI voice unavailable (${response.status})`);
      return await response.blob();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 450 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function preloadIntroduction() {
  for (const lesson of lessons) {
    for (const [speaker,text] of lesson.lines) {
      try { await getAudio(speaker,text); } catch { return; }
    }
  }
}

async function speak(speaker, text) {
  const character = speaker === "Maya" ? maya : leo;
  speechRequest = new AbortController();
  character.classList.add("speaking");
  try {
    const blob = await getAudio(speaker, text); audioUrl = URL.createObjectURL(blob); azureAudio = new Audio(audioUrl);
    azureAudio.onended = () => { character.classList.remove("speaking"); $("playIcon").textContent = "▶"; };
    azureAudio.onerror = () => browserSpeak(speaker,text);
    await azureAudio.play();
  } catch (error) {
    character.classList.remove("speaking");
    if (error.name !== "AbortError") browserSpeak(speaker,text);
  }
}

function stopVoice(){ if(speechRequest)speechRequest.abort(); speechRequest=null; if(azureAudio){azureAudio.pause();azureAudio=null} if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null} speechSynthesis.cancel(); maya.classList.remove("speaking");leo.classList.remove("speaking"); }

function nextLine() { lineIndex = (lineIndex + 1) % lessons[lessonIndex].lines.length; showLine(); }
function finishIntro() { stopVoice(); $("lessonView").classList.add("hidden"); $("practiceView").classList.remove("hidden"); window.scrollTo({top:0, behavior:"smooth"}); }

$("skipLineButton").addEventListener("click", nextLine);
$("replayButton").addEventListener("click", () => showLine());
$("playButton").addEventListener("click", () => {
  if (!soundOn) { soundOn = true; updateSound(); showLine(); return; }
  if (azureAudio) { const speaker=lessons[lessonIndex].lines[lineIndex][0],character=speaker==="Maya"?maya:leo; if(!azureAudio.paused){azureAudio.pause();paused=true;$("playIcon").textContent="▶";character.classList.remove("speaking")}else{azureAudio.play();paused=false;$("playIcon").textContent="Ⅱ";character.classList.add("speaking")} return; }
  if (speechSynthesis.speaking && !paused) { speechSynthesis.pause(); paused = true; $("playIcon").textContent = "▶"; maya.classList.remove("speaking"); leo.classList.remove("speaking"); }
  else if (paused) { speechSynthesis.resume(); paused = false; $("playIcon").textContent = "Ⅱ"; const speaker = lessons[lessonIndex].lines[lineIndex][0]; (speaker === "Maya" ? maya : leo).classList.add("speaking"); }
  else showLine();
});
$("nextButton").addEventListener("click", () => { if (lessonIndex < lessons.length - 1) { lessonIndex++; renderLesson(); } else finishIntro(); });
$("skipLessonButton").addEventListener("click", () => { if (lessonIndex < lessons.length - 1) { lessonIndex++; renderLesson(); } else finishIntro(); });
$("soundToggle").addEventListener("click", () => { soundOn = !soundOn; if (!soundOn) stopVoice(); updateSound(); });
function updateSound(){ $("soundIcon").textContent = soundOn ? "♪" : "×"; $("soundLabel").textContent = soundOn ? "Sound on" : "Sound off"; $("soundToggle").setAttribute("aria-label", soundOn ? "Turn sound off" : "Turn sound on"); }
$("restartButton").addEventListener("click", () => { lessonIndex=0; $("practiceView").classList.add("hidden"); $("lessonView").classList.remove("hidden"); renderLesson(); });
let recognition, recording = false, secondsLeft = 60, timerId, transcript = "";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function resetDebate(){ recording=false; transcript=""; secondsLeft=60; clearInterval(timerId); $("timer").textContent="01:00"; $("recordCard").classList.remove("recording"); $("recordTitle").textContent="Ready when you are"; $("recordHint").textContent="Tap the microphone and start speaking."; $("liveTranscript").textContent=""; $("liveTranscript").classList.add("hidden"); $("finishButton").classList.add("hidden"); }
function openDebate(){ stopVoice(); $("practiceView").classList.add("hidden"); $("feedbackView").classList.add("hidden"); $("debateView").classList.remove("hidden"); resetDebate(); window.scrollTo({top:0,behavior:"smooth"}); }
function toggleRecording(){ if(recording){finishRecording();return} recording=true; $("recordCard").classList.add("recording"); $("recordTitle").textContent="We’re listening…"; $("recordHint").textContent="Speak naturally. Finish whenever you’re ready."; $("liveTranscript").classList.remove("hidden"); $("finishButton").classList.remove("hidden"); timerId=setInterval(()=>{secondsLeft--;$("timer").textContent=`00:${String(secondsLeft).padStart(2,"0")}`;if(secondsLeft<=0)finishRecording()},1000);
  if(SpeechRecognition){ recognition=new SpeechRecognition(); recognition.continuous=true; recognition.interimResults=true; recognition.lang="en-US"; recognition.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)transcript+=t+" ";else interim+=t}$("liveTranscript").textContent=transcript+interim}; recognition.onerror=()=>{$("recordHint").textContent="I couldn’t hear that clearly, but you can still finish for sample feedback."}; recognition.start(); }
  else $("liveTranscript").textContent="Live transcription isn’t available in this browser. Keep speaking—we can still show the coaching flow.";
}
function finishRecording(){if(!recording)return;recording=false;clearInterval(timerId);if(recognition)try{recognition.stop()}catch(e){};$("recordCard").classList.remove("recording");showFeedback()}
function showFeedback(){ $("debateView").classList.add("hidden");$("feedbackView").classList.remove("hidden");const lower=transcript.toLowerCase(),words=lower.split(/\s+/).filter(Boolean),position=/\b(think|believe|should|shouldn't)\b/.test(lower),reason=/\b(because|since|reason)\b/.test(lower),example=/\b(for example|for instance|such as)\b/.test(lower);$("clarityScore").textContent=position?5:words.length>8?4:3;$("reasonScore").textContent=reason?5:words.length>15?4:3;$("exampleScore").textContent=example?5:words.length>25?4:3;$("coachTip").textContent=!reason?'Connect your position to a reason. Try: “I believe this because…”':!example?'Your reason is clear. Now make it memorable with: “For example…”':'Nice structure! On your next try, make your example even more specific.';window.scrollTo({top:0,behavior:"smooth"}) }
$("startDebateButton").addEventListener("click", openDebate);
$("micButton").addEventListener("click", toggleRecording); $("finishButton").addEventListener("click", finishRecording); $("tryAgainButton").addEventListener("click", openDebate);
$("backButton").addEventListener("click",()=>{clearInterval(timerId);if(recognition)try{recognition.stop()}catch(e){};$("debateView").classList.add("hidden");$("practiceView").classList.remove("hidden")});
document.addEventListener("keydown", e => { if(e.key === "ArrowRight") nextLine(); if(e.key === " "){e.preventDefault(); $("playButton").click();} });
speechSynthesis.onvoiceschanged = () => {};
renderLesson(true);
preloadIntroduction();
