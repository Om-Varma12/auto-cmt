chrome.runtime.onInstalled.addListener(() => {
  console.log('CMT Autofill extension installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('CMT Autofill extension starting up');
});
