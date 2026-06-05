let server_url = "https://mil.psy.ntu.edu.tw";

browser.runtime.onInstalled.addListener(({reason}) => {
    if (reason === 'install') {
        browser.tabs.create({
            url: server_url + "/welcome"
        });
        // browser.storage.local.set({wasExtensionEnabled: true});
    }
});

function checkIfEnabled() {
    browser.storage.sync.get(['user_id'], function (result) {
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
                    browser.storage.sync.set({["enabled"]: d['enabled']});
                })
                .catch(error => {
                    console.log(error);
                    // browser.storage.sync.set({["enabled"]: false});
                });
        }
    });
}

if (typeof browser !== 'undefined' && browser.alarms) {
    browser.runtime.onInstalled.addListener(() => {
        browser.alarms.create('CheckIfEnabled', {periodInMinutes: 1 * 60});
    });
    browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'CheckIfEnabled') {
            checkIfEnabled();
        }
    });
} else {
    setInterval(checkIfEnabled, 60 * 60 * 1000);
}
