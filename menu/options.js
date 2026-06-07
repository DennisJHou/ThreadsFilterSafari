$("#show_scores").change(function() {
    if(this.checked)
        browser.storage.sync.set({show_scores: true});
    else
        browser.storage.sync.set({show_scores: false});
});


browser.storage.sync.get(['show_scores']).then(function (items) {
    let show_scores = items.show_scores;
    let active = false;
    if (show_scores) {
        $("#show_scores").prop('checked', true);
        active = true;
    }

    // const event = new CustomEvent("EnableDebug", {detail: { active: active}});
    // window.dispatchEvent(event);
});

let clicks_count = 0;

$("body").click(function (){
    clicks_count++;
    if (clicks_count>5){
        $(".options_container").show();
    }
});