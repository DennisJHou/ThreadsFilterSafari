let server_url =  "https://mil.psy.ntu.edu.tw";

chrome.runtime.onInstalled.addListener(({reason}) => {
    if (reason === 'install') {
        chrome.tabs.create({
            url: server_url + "/welcome"
        });
        // chrome.storage.local.set({wasExtensionEnabled: true});
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('CheckIfEnabled', {periodInMinutes: 1 * 60});
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'CheckIfEnabled') {
        chrome.storage.sync.get(['user_id'], function (result) {
            if (result) {
                console.log(result['user_id']);

                let fetchRes = fetch(server_url + '/is_enabled?user_id=' + result['user_id']);

                fetchRes
                    .then(res => {
                        if (!res.ok)
                            throw new Error('Network response was not ok');
                        return res.json();
                    })
                    .then(d => {
                        console.log(d);
                        chrome.storage.sync.set({["enabled"]: d['enabled']});
                    })
                    .catch(error => {
                        console.log(error);
                        // chrome.storage.sync.set({["enabled"]: false});
                    });
            }
        });
    }
});
