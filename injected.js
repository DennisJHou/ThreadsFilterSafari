console.log("Script: injected.js loaded!");

window.ThreadsFilterInjected = true;

function extensionConflict(origin) {
    // CHOOSE WHAT TO DO IF THE USER HAS A CONFLICTING EXTENSION
    // i.e., redirect to a message
    switch (origin) {
        case 'sameCode':
            // There is already an injected script.
            alert("Conflict: The extension detected a conflict. Are you enrolled in 2 studies?");
            break;
        case 'isXHRModified':
            // There is another extension intercepting the network requests.
            // This could be an ads blocker (no problem), or a similar study (potential problems)
            alert("Conflict: The extension detected a potential conflict.");
            break;
        default:
            console.log("Conflict: unspecified reason.");
    }
}

if (typeof window.SUBSCRIBED !== "undefined") {
    console.error("window.SUBSCRIBED already defined. Conflict.");
    extensionConflict("sameCode");
} else {
    // Define your variables only if they are not already defined
    window.SUBSCRIBED = ["query"]; // "bulk-route-definitions"];
    const barcelonaQueries = [
        'BarcelonaLoggedOutFeedPaginationQuery',
        'BarcelonaFeedDirectQuery', 'BarcelonaFeedPaginationDirectQuery', // main feed
        'BarcelonaProfileThreadsTabDirectQuery', 'BarcelonaProfileThreadsTabRefetchableDirectQuery', // other account's feed
        'BarcelonaProfileRepliesTabRefetchableDirectQuery', // other account's replies tab 
        'BarcelonaProfileRepostsTabDirectQuery', // other account's reposts tab
        'BarcelonaPostPageDirectQuery', 'BarcelonaPostPageRefetchableDirectQuery', // replies of a particular post
        'BarcelonaActivityFeedStoryListContainerQuery', 'BarcelonaActivityFeedListPaginationQuery', // Pinned activity feed
        'BarcelonaCustomFeedPostsRootQuery', 'BarcelonaCustomFeedRefetchableQuery', // Pinned custom feed
        'BarcelonaLikedPageViewerQuery', 'BarcelonaLikedPageRefetchableQuery', // Pinned liked feed
        'BarcelonaSavedPageViewerQuery', 'BarcelonaSavedPageRefetchableQuery', // Pinned saved feed
        'BarcelonaSearchResultsQuery', 'BarcelonaSearchResultsRefetchableQuery', 'BarcelonaSearchTrendingTopicsV2SectionQuery' // Pinned search feed
    ];
        
    window.httpRequestIdCounter = 0;
    window.event_handlers = {};

    function isNativeFunction(func) {
        return func.toString().indexOf('[native code]') !== -1;
    }

    (function (xhr) {
        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        const send = XHR.send;
        const setRequestHeader = XHR.setRequestHeader;

        const isXHRModified =
            !isNativeFunction(XMLHttpRequest.prototype.open) ||
            !isNativeFunction(XMLHttpRequest.prototype.send) ||
            !isNativeFunction(XMLHttpRequest.prototype.setRequestHeader);

        if (isXHRModified) extensionConflict("isXHRModified");

        XHR.setRequestHeader = function (header, value) {
            this._requestHeaders[header] = value;
            return setRequestHeader.apply(this, arguments);
        };

        XHR.open = function (method, url) {
            this._url = url;
            this._id = window.httpRequestIdCounter++;
            this._startTime = new Date().toISOString();
            this._requestHeaders = {};
            return open.apply(this, arguments);
        };

        XHR.send = function (postData) {
            let actionName;
            try {
                actionName = new URL(this._url, window.location.origin).pathname.split("/").at(-1);
            } catch (e) {
                console.error("Invalid URL:", this._url);
                return send.apply(this, arguments);
            }

            // Show the payload before sending
            // console.log("XHR Payload for ID " + this._id + ":", postData);

            if (actionName === "query"){
                // console.log(postData); // print all captured calls to find internal APIs
                const matchedQuery = barcelonaQueries.find(query => postData.includes(query));
                if (matchedQuery) {
                    const callback = this.onreadystatechange;
                    this.onreadystatechange = function () {
                        if (this.readyState === XMLHttpRequest.DONE) {
                            const response = this.responseText;
                            // console.log(response);
                            if (response.length > 0) {
                                window.event_handlers[this._id] = {
                                    callback: callback,
                                    source: this,
                                    arguments: arguments
                                };

                                const event = new CustomEvent("FeedRequest", {
                                    detail: {
                                        id: this._id,
                                        startTime: this._startTime,
                                        url: this._url,
                                        type: matchedQuery,
                                        response: this.response
                                    }
                                });

                                window.dispatchEvent(event);
                                //console.log("Request Headers for ID " + this._id + ":", this._requestHeaders);
                                console.log("Request Headers for ID " + this._id)
                                console.log("Waiting for the green light for connection #" + this._id);
                            }
                        }
                    };
                }
                else if(postData.includes("BarcelonaCopyAsImageDialogQuery")){EngagementEvent("CopyRepost", postData);}
            }
            else if(actionName === "graphql"){
                // NOTE (2026-06): Threads renamed its mutations from the
                // "Barcelona*" family to the "useTH*" family. Check Unlike
                // before Like so the more specific match wins.
                if(postData.includes("useTHLikeMutationUnlikeMutation")) {EngagementEvent("UnlikePost", postData);}
                else if(postData.includes("useTHLikeMutationLikeMutation")) {EngagementEvent("LikePost", postData);}
                else if(postData.includes("useTHCreateRepostMutation")) {EngagementEvent("CreateRepost", postData);}
                else if(postData.includes("useTHDeleteRepostMutation")) {EngagementEvent("DeleteRepost", postData);}
                else if(postData.includes("useBarcelonaDeletePostMutation")) {EngagementEvent("DeletePost", postData);}
                else if(postData.includes("BarcelonaComposerScheduleButtonQuery")) {EngagementEvent("ComposerScheduleClick", postData);}
                else if(postData.includes("BarcelonaShareToIGStoryDialogPreviewQuery")) {EngagementEvent("ShareToIGStory", postData);}
                else if(postData.includes("BarcelonaPostEmbedDialogQuery")) {EngagementEvent("GetEmbedCode", postData);}
            }
            return send.apply(this, arguments);
        };
    })(XMLHttpRequest);
}

/*************************************************
 *  Fetch API interception (post‑creation endpoints ONLY)
 *************************************************/
(function (origFetch) {
    if (typeof origFetch !== 'function') return; // Nothing to intercept if fetch is missing

    /* Utility – extract body as string while leaving original Request intact */
    async function readBody(input, init) {
        try {
            // Case 1: input is Request
            if (input instanceof Request) {
                const cloned = input.clone();
                if (cloned.method && cloned.method.toUpperCase() !== 'GET') {
                    return await cloned.text();
                }
            }
            // Case 2: we only have init
            if (init && init.body) {
                if (typeof init.body === 'string') return init.body;
                if (init.body instanceof URLSearchParams) return init.body.toString();
                if (init.body instanceof FormData) {
                    const pairs = [];
                    for (const [k, v] of init.body.entries()) pairs.push(`${k}=${v}`);
                    return pairs.join('&');
                }
            }
        } catch (_) {
            /* swallow */
        }
        return '';
    }

    window.fetch = function (input, init) {
        let url = '';
        if (typeof input === 'string' || input instanceof URL) {
            url = input.toString();
        } else if (input instanceof Request) {
            url = input.url;
        }

        // Compute pathname and action name robustly (handles trailing slash)
        let actionName = '';
        try {
            const pathname = new URL(url, window.location.origin).pathname;
            const segments = pathname.split('/').filter(Boolean); // drop empty items from trailing slash
            actionName = segments.length ? segments[segments.length - 1] : '';
        } catch (_) {
            /* ignore malformed */
        }

        // Fetch method (default GET if none provided)
        const method = (
            (init && init.method) ||
            (input instanceof Request && input.method) ||
            'GET'
        ).toUpperCase();

        // Intercept only POSTs of the two publish endpoints; more can be added later
        if (method === 'POST') {
            if (actionName === 'configure_text_only_post') {
                readBody(input, init).then(bodyText => {
                    EngagementEvent('CreateTextOnlyPost', bodyText);
                });
            } else if (actionName === 'configure_text_post_app_feed') {
                readBody(input, init).then(bodyText => {
                    EngagementEvent('CreateImagePost', bodyText);
                });
            }
        }

        return origFetch.apply(this, arguments);
    };
})(window.fetch);


// Helper for Engagement Events
function EngagementEvent(eventName, postData) {
    const params = new URLSearchParams(postData);
    const result = {};
    for (const [key, value] of params.entries()) {
        result[key] = value;
    }
    //console.log(eventName,result);
    const event = new CustomEvent(eventName, {detail: result});
    window.dispatchEvent(event);
}

window.addEventListener("CustomFeedReady", function (evt) {
    console.log("Green light for connection #" + evt.detail.id);

    const event_handler = window.event_handlers[evt.detail.id];
    const modifiedResponse = evt.detail.response;

    Object.defineProperty(event_handler.source, 'responseText', {
        get() {
            return modifiedResponse;
        }
    });

    Object.defineProperty(event_handler.source, 'response', {
        writable: true
    });

    event_handler.source.responseText = evt.detail.response;
    event_handler.source.response = evt.detail.response;

    console.log("CustomFeedReady") //, event_handler.source);

    event_handler.callback.apply(event_handler.source, event_handler.arguments);
}, false);

/*****************************
 * Change URL event
 *****************************/

// https://stackoverflow.com/questions/6390341/how-to-detect-if-url-has-changed-after-hash-in-javascript
(() => {
    const oldPushState = history.pushState;
    history.pushState = function pushState() {
        const ret = oldPushState.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
    };

    const oldReplaceState = history.replaceState;
    history.replaceState = function replaceState() {
        const ret = oldReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
    };

    window.addEventListener('popstate', () => {
        window.dispatchEvent(new Event('locationchange'));
    });
})();

window.addEventListener('locationchange', () => {
    const event = new CustomEvent("UrlChanged", {
        detail: {
            url: location.href
        }
    });
    window.dispatchEvent(event);
});

// Log the first load
window.dispatchEvent(new Event('locationchange'));
