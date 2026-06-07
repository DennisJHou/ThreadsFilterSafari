console.log("Script: logic.js loaded!")

const banner_container = `<div class="top_banner" style="background-color: {0}!important">
    <div class="top_banner-content black">
    {1}
    </div>
  </div>`

let totalPosts = 0;
let bannerShown = false;

function enable_banner_update(banner_text, posts_count) {
    window.addEventListener("PostVisible", function (evt) {
        totalPosts+=1;
        console.log('TotalPosts:',totalPosts);
        if(totalPosts>posts_count) {
            $(".top_banner-content").html(banner_text);
            if (!bannerShown)
                console.log("EODSurveyShown", {});
            bannerShown=true;
        }
    }, false);
}

function addBanner(b) {
  if (!b || Object.keys(b).length === 0) return;
  const top_banner = $(`
    <div class="top_banner" style="background-color:${b.banner_color}!important">
      <div class="top_banner-content black">
        ${b.text}
      </div>
    </div>`);
  $("body").prepend(top_banner);

  if ("triggered" in b) {
    enable_banner_update(b.triggered, b.posts_count);
  }
}

window.addEventListener("FeedRequest", function (evt) {

    console.log("FeedRequest") //, evt.detail);
    client.postRequest("/get_feed", evt.detail,
        function (res) {
            addBanner(res.banner);

            const event = new CustomEvent("CustomFeedReady",
                {
                    detail: {
                        id: evt.detail.id,
                        url: evt.detail.url,
                        response: res.feed
                    }
                });

            window.dispatchEvent(event);
            if ($('triangle-top-right').length <1) {
                $("body").prepend($("<div class=\"triangle-top-right\"></div>"));
            }


        },
        function (res) {
            const event = new CustomEvent("CustomFeedFailed", {
                detail: {
                    id: evt.detail.id
                }
            });
            window.dispatchEvent(event);
        });

}, false);


window.addEventListener("ThreadsFilter.Enable", function (evt) {
    browser.storage.sync.set({enabled: true});
});

window.addEventListener("ThreadsFilter.Disable", function (evt) {
    browser.storage.sync.set({enabled: false});
});

window.addEventListener("ThreadsFilter.RegisterParticipant", function (evt) {
    // The user read the IRB and accepted to join
    browser.storage.sync.set({user_id: evt.detail.user_id}).then(function () {
        browser.storage.sync.set({["enabled"]: true});
        const event = new CustomEvent("ThreadsFilter.RegisterParticipantDone", {bubbles:true, composed:true});
        window.dispatchEvent(event);
    });
}, false);
