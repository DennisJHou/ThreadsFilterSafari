console.log("Script: config.js loaded!")

let Globals = {
    alive_interval: 10000,
    user_id: null,
    user_ip: null,
    user_agent:  navigator.userAgent,
    server_url: "https://mil.psy.ntu.edu.tw"
}

//fetch("https://api.ipify.org?format=json")
//  .then(res => res.json())
//  .then(data => {Globals.user_ip=data.ip})
//  .catch(err => console.error("Failed to get IP:", err));

// DEBUG ONLY — auto-populate storage for testing; remove before production
browser.storage.sync.get(['user_id']).then(function(items) {
    if (!items.user_id) {
        browser.storage.sync.set({user_id: 'test_debug_001', enabled: true, show_scores: true});
        console.log("DEBUG: Auto-set test storage (user_id was empty)");
    } else {
        console.log("DEBUG: Storage already has user_id =", items.user_id);
    }
});
