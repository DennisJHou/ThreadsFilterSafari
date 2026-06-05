/*
 * events.js – Threads edition with IntersectionObserver 🛰️
 * ------------------------------------------------------------------
 * Re-implements the viewport-tracking layer using a native
 * IntersectionObserver instead of the 800 ms polling loop.  Each post
 * root is observed exactly once; when it first intersects the
 * viewport we log an impression and spin up dwell-time timers.  A
 * MutationObserver keeps the watch list fresh as Threads streams new
 * items into the DOM.
 */

class EventsManager {
    // ─────────────────────────────────────────────────────────── constants ──

    /** Post-id matcher – captures slug after /post/ or /t/. */
    static postIdRegex = /(?:\/post\/|\/t\/)([A-Za-z0-9_-]+)/;

    // ───────────────────────────────────────────────────────────── state ──

    /** Posts we have already emitted RenderedPosts for (per page‑load). */
    static renderedPostHistory = new Set();
    /** Posts that have fired PostVisible (first-pixel impression). */
    static visualisedPosts = new Set();

    /** Guard against double‑init inside the same isolated world. */
    static _hasInitialised = false;

    /** Timestamp when the last RenderedPosts batch was sent. */
    static lastRender          = Date.now();

    /** Optional debug overlay – set via chrome.storage. */
    static enableDebug         = false;

    constructor() {
        //this.onScroll    = this.onScroll.bind(this);
        this.onUnload    = this.onUnload.bind(this);
        this.onUrlChange = this.onUrlChange.bind(this);
        this.onEngagement= this.onEngagement.bind(this);
        this.userLeaveTab= this.userLeaveTab.bind(this);
        this.userReturnToTab = this.userReturnToTab.bind(this);

        // bootstrap
        this.run();
    }

    // ────────────────────────────────────────────────────────── bootstrap ──
    run() {
        EventsManager._hasInitialised = true;

        console.info("[EventsManager] Threads telemetry agent (IO edition)");

        // ——— Page-level listeners ———
        $(window)
            //.on("resize scroll", this.onScroll).bind(this)
            .on("beforeunload", this.onUnload).bind(this);

        // ——— Idle / background tracking (TimeMe.js) ———
        TimeMe.initialize({ idleTimeoutInSeconds: 60 });
        TimeMe.callWhenUserLeaves(this.userLeaveTab);
        TimeMe.callWhenUserReturns(this.userReturnToTab);

        // ——— SPA URL changes announced by injected.js ———
        window.addEventListener("UrlChanged", this.onUrlChange, false);

        // ——— Engagement events piped from injected.js ———
        const ENGAGEMENT_EVENTS = [
            "LikePost",         // both spellings
            "UnlikePost",
            "CreateRepost", "DeleteRepost", "CopyRepost",
            "CreateTextOnlyPost", "CreateImagePost",
            "DeletePost",
            // 2026-06 additions (new Threads API surface)
            "ComposerScheduleClick", "ShareToIGStory", "GetEmbedCode"
        ];
        ENGAGEMENT_EVENTS.forEach(ev =>
            window.addEventListener(ev, this.onEngagement, false));

        // ——— IntersectionObserver for viewport impressions ———
        this.io = new IntersectionObserver(
            this.handleIntersection.bind(this),
            { root: null, rootMargin: "0px", threshold: 0 }
        );

        // Observe everything currently in the DOM
        this.observeExistingPosts();

        // ——— Delegated outbound link click tracker ———
        document.addEventListener(
            "click",
            this.handleDocumentClick.bind(this),
            true   // capture phase – fires before Threads' own handlers
        );

        // ——— MutationObserver to capture future streamed posts ———
        this.mo = new MutationObserver(this.handleMutations.bind(this));
        // use <document> not body ⇒ always a Node, even pre-<body>
        this.mo.observe(document, { childList: true, subtree: true });

        // Optional debug flag (uncomment if needed)
        // chrome.storage.sync.get(["show_scores"], ({show_scores}) => {
        //     EventsManager.enableDebug = !!show_scores;
        // });
    }

    // ───────────────────────────────────────────── observe utilities ──

    /**
     * Scan DOM for anchors that look like Threads permalinks and register
     * their closest post root with the IntersectionObserver.
     */
    observeExistingPosts(root = document) {
        const anchors = root.querySelectorAll("a[href*='/post/'],a[href*='/t/']");
        anchors.forEach(a => {
            const m = a.href.match(EventsManager.postIdRegex);
            if (!m) return;
            const postId = m[1];
            if (EventsManager.renderedPostHistory.has(postId)) return;

            const postRoot =
                a.closest("[data-testid^='thread-item']") ||
                a.closest("[data-testid^='post']")        ||
                a.closest("div[role='article']")          ||
                a; // fallback

            if (!postRoot) return;
            postRoot.dataset.postId = postId;
            this.io.observe(postRoot);
            EventsManager.renderedPostHistory.add(postId);
            this.onRenderedPosts([postId]);
        });
    }

    /** MutationObserver callback – observe anchors in newly-added subtrees. */
    handleMutations(mutations) {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;      // not ELEMENT_NODE
                this.observeExistingPosts(node);
            });
        });
    }

    /** IntersectionObserver callback – fires when a post enters the viewport. */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const postRoot = entry.target;
            const postId   = postRoot.dataset.postId;
            if (!postId) return;

            if (!EventsManager.visualisedPosts.has(postId)) {
                // First-pixel impression
                client.logEvent("PostVisible", { postId });
		window.dispatchEvent(new CustomEvent("PostVisible",{}));
                EventsManager.visualisedPosts.add(postId);
            }

            // Dwell‑time buckets (1 s, 3 s, 5 s …) – log once per post
            [1, 3, 5, 10].forEach(sec => {
                setTimeout(() => {
                    const r = postRoot.getBoundingClientRect();
                    const inView = r.top    >= 0 &&
                                   r.left   >= 0 &&
                                   r.bottom <= (window.innerHeight ||
                                                document.documentElement.clientHeight) &&
                                   r.right  <= (window.innerWidth  ||
                                                document.documentElement.clientWidth);
                    if (inView) client.logEvent(`PostVisible${sec}Sec`, { postId });
                }, sec * 1000);
            });

            // Optional debug overlay
            if (EventsManager.enableDebug &&
                !postRoot.hasAttribute("has_label") &&
                window.scores && scores[`post-${postId}`]) {

                postRoot.setAttribute("has_label", "TRUE");
                const label = document.createElement("span");
                label.className = "tm‑score";
                label.textContent = `★ ${scores[`post-${postId}`].toFixed(2)}`;
                Object.assign(label.style, {
                    position: "absolute",
                    right:   "4px",
                    top:     "4px",
                    background: "#ffeb3b",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    fontWeight: "bold",
                    fontSize: "12px"
                });
                postRoot.style.position = "relative";
                postRoot.appendChild(label);
            }
        });
    }

    // ─────────────────────────────────────────────────── event sinks ──

    onTabStateCheck() {
        // console.log("Tab state: " + document.visibilityState)
        client.logEvent("Alive", {"url": document.URL, "visibility": document.visibilityState});
    }

    /*
    onScroll() {
        const y = Math.round(window.scrollY || document.documentElement.scrollTop);
        client.logEvent("Scroll", { y });
    }
    */

    onUnload() {
        client.logEvent("PageUnload", { url: document.URL });
    }

    /** Receives UrlChanged from injected.js */
    onUrlChange(e) {
        client.logEvent("UrlChange", { url: e.detail.url });
    }

    onEngagement(e) {
        client.logEvent(e.type, e.detail);
    }

    userLeaveTab() {
        client.logEvent("UserLeaveTab", { url: document.URL });
    }

    userReturnToTab() {
        client.logEvent("UserReturnOnTab", { url: document.URL });
    }

    // helper
    onRenderedPosts(ids) {
        client.logEvent("RenderedPosts", { ids: Array.from(ids) });
        EventsManager.lastRender = Date.now();
    }

    /** Document-level click handler – captures every <a> click, even ones injected later. */
    handleDocumentClick(e) {
        const link = e.target.closest("a[href]");
        if (!link) return;

        // Determine post_id if possible
        const postRoot = link.closest("[data-testid^='thread-item'],[data-testid^='post'],div[role='article']");
        let postId = postRoot?.dataset.postId ?? null;

        if (!postId) {
            const m = link.href.match(EventsManager.postIdRegex);
            if (m) postId = m[1];
        }

        // Ignore internal SPA navigation if you only want external flows
        // Example guard (uncomment if needed):
        // if (link.origin === location.origin && link.pathname.startsWith('/@')) return;

        this.onLinkClick({ href: link.href, post_id: postId });
    }

    // placeholder – real implementation lives elsewhere
    onLinkClick(payload) {
        client.logEvent("LinkClick", payload);
    }
}

// ───────────────────────────────────────── polyfills & helpers ──
if (!String.prototype.format) {
    String.prototype.format = function () {
        let str = this.toString();
        for (let i = 0; i < arguments.length; i++) {
            str = str.replace("{" + i + "}", arguments[i]);
        }
        return str;
    };
}

/** Same as lodash#clamp – keep footprint tiny. */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Test helper for viewport impression (unit tests)
if (typeof window !== "undefined") {
    window.__isInViewport = function (element) {
        const rect = element.getBoundingClientRect();
        const h = window.innerHeight ||
                  document.documentElement.clientHeight;
        const w = window.innerWidth  ||
                  document.documentElement.clientWidth;
        return rect.top    >= 0 &&
               rect.left   >= 0 &&
               rect.bottom <= h &&
               rect.right  <= w;
    };
}

window.EventsManager = EventsManager;
