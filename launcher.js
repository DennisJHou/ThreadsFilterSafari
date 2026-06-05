const eventsManager = new EventsManager();
if (location.href.includes("threads.com") || location.href.includes("threads.net")) {
    // We are on Threads
    browser.storage.sync.get(['user_id', 'show_scores', 'enabled'], function (items) {
        let user_id = items.user_id;
        if (!items.enabled) {
            console.log("Extension is disabled.");
            return;
        }
        if(items.show_scores) {
            EventsManager.enableDebug=true;
        }
        // let token = items.token;
        if (user_id) {
            console.log("User id: " + user_id);
            init(user_id);
        } else {
            // If the user did not read the Consent Form
            // and the IRB, nothing happens
            console.log("No user ID: The participant didn't accept the consent. ThreadsFilter is not running.");
            // $("body").prepend($(banner_top));
        }

    });
}
else {
    // We are on the hub server, nothing to do
    console.log("Extension running...")
}

function init(user_id) {
    Globals["user_id"] = user_id;
    // Globals["token"] = token;
    Globals["tab_id"] = uuidv4();
    ////////////////////////////////////////
    // Inject the script in the page space
    ////////////////////////////////////////
    const s = document.createElement('script');
    s.src = browser.runtime.getURL('injected.js');
    s.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(s);

    // client.startHeartBeat(Globals["alive_interval"]);

    eventsManager.run();

    // $("body").prepend($("<div class=\"triangle-top-right\"></div>"));

}
//init('debug123')
window.addEventListener("UrlChanged", eventsManager.onUrlChange, false);
