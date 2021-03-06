/**
 * Konichiwa~
 *
 * This is responsible for the functionality of the dashboard
 * page, which includes things like settings, about etc.
 */

/**
 * We need to merge bootstraps methods to jquery so that
 * the compiler wont freak out. Thats why we need the
 * declaration below.
 */
/* tslint:disable:no-namespace interface-name */
declare global {
    interface JQuery {
        tooltip(): JQuery;
        modal(param?: string): JQuery;
        tab(param?: string): JQuery;
    }
}
/* tslint:enable:no-namespace interface-name*/

import {Intent, IRuntimeResponse, Settings} from "./lib/common";
import {decomposeURL, loadSettings} from "./lib/utils";

let settingsKeys = Object.keys(Settings);

/**
 * Contains a list of settings keys for the checkboxes.
 * Why not get it from {@link Settings}? Because we dont
 * want all the settings to be bound to checkboxes.
 */
let checkboxKeys: string[] = [
    "downloadAll",
    "malAutoUpdate",
    "myAnimeList",
    "remAds",
    "remComments",
    "remInfo",
    "remSocialShare",
    "remSuggested",
    "resPlayer",
    "utilityBar",
];

/**
 * Cache the JQuery selectors right here.
 */
let malLoginBtn = $("#mal-configure__login");
let malLoginProgress = $("#mal-configure__login-progress");
let malLoggedInStatus = $("#mal-configure__status");
let malResetButton = $("#mal-configure__reset");
let malUsernameInput = $("#mal-configure__username");
let malPasswordInput = $("#mal-configure__password");
let malFormOverlay = $("#mal-configure__form-overlay");

let adBlockFiltersInput = $("#ads-configure__adBlockFilters");
let adBlockApplyBtn = $("#ads-configure__apply");
let adBlockProgress = $("#ads-configure__progress");

/**
 * Bootstrap Initialization for showing the tooltips
 */
$(() => {
    $("[data-toggle='tooltip']").tooltip();
});

/**
 * Toggle/Open parts of settings page by passing on
 * a query parameter. For example:
 *      chrome-extension://ehgnkecbhcagdnpeakiiebcmbiipillp/dashboard.html?open=MyAnimeList
 * This will directly open the MAL configure modal as
 * soon as the settings page is opened.
 */
(() => {
    let decomposed = decomposeURL(document.location.href);
    if (decomposed[1] && decomposed[1].goto) {
        switch (decomposed[1].goto) {
            case "MyAnimeList":
                $("#mal-configure").modal("toggle");
                break;
            case "Changelog":
                $("#changelog-tab").tab("show");
                break;
            default:
                break;
        }
    }
})();

/* --- Load a random pro tip at startup --- */
// const tips = $("#tips");
// const tipsList = [
//     "hover over an option to get more details",
//     "press <kbd>s</kbd> within 9anime to access the alternate search overlay",
// ];
// tips.html(tipsList[Math.floor(Math.random() * tipsList.length)]);
/* --- ^.^ --- */

/* --- Version --- */
$("#version").text(chrome.runtime.getManifest().version);
/* --- ~~~ --- */

/**
 * This runs as soon as the page loads. What this does is
 * loads the settings and set the checkbox state for those
 * settings in the options page.
 */
loadSettings(settingsKeys).then(resp => {
    // console.log(resp);
    for (let key of checkboxKeys) {
        // Luck for us, the key and it id are named the same.
        // So we can just bind it directly without any hassle.
        $(`#${key}`).prop("checked", !!resp[key]);
    }

    // Stuff to do after loading the settings.
    /* -- MAL Related --- */
    if (resp.myAnimeList) {
        malFormOverlay.hide();
    } else {
        malFormOverlay.show();
    }
    if (resp.malUsername && resp.malPassword) {
        disableMalLogin();
    } else {
        enableMalLogin();
    }

    /* --- AdBlocker Related --- */
    if (resp.adBlockFilters) {
        adBlockFiltersInput.text(resp.adBlockFilters.join("\n"));
    }
});

/**
 * Listen to the change event on all the checkboxes
 * and save settings when change event is triggered.
 */
for (let key of checkboxKeys) {
    $(`#${key}`).on("change", e => {
        let target = $(e.currentTarget);
        let targetId = target.attr("id");
        if (targetId) {
            switch (targetId) {
                case "myAnimeList":
                    malTogglePermission(target.is(":checked"));
                    break;

                case "remAds":
                    adsTogglePermission(target.is(":checked"));
                    break;

                default:
                    chrome.storage.local.set({
                        [targetId]: target.is(":checked"),
                    });
                    break;
            }
            // console.log(target.attr("id"), target.is(":checked"));
        }
    });
}

/**
 * Handles the permission grant while toggling the MAL
 * integration checkbox. Permission is added on check
 * and removed on uncheck.
 */
function malTogglePermission(isChecked: boolean): void {
    let perms: chrome.permissions.Permissions = {
        origins: ["https://myanimelist.net/api/*"],
    };
    if (isChecked) {
        malFormOverlay.hide();
        chrome.permissions.request(perms, granted => {
            if (granted) {
                chrome.storage.local.set({
                    myAnimeList: true,
                });
            } else {
                // we need to trigger "change" to get that
                // reverse animation on the checkbox.
                $("#myAnimeList").prop("checked", false).trigger("change");
            }
        });
    } else {
        malFormOverlay.show();
        chrome.permissions.remove(perms);
        chrome.storage.local.set({
            myAnimeList: false,
        });
    }
}

/**
 * Handles the permission grant while toggling the remAds
 * checkbox. Permission is added on check and removed on
 * uncheck.
 */
function adsTogglePermission(isChecked: boolean): void {
    let perms: chrome.permissions.Permissions = {
        origins: ["<all_urls>"],
        permissions: [
            "webRequest",
            "webRequestBlocking",
        ],
    };
    if (isChecked) {
        chrome.permissions.request(perms, granted => {
            if (granted) {
                chrome.storage.local.set({
                    remAds: true,
                });
                chrome.runtime.sendMessage({
                    intent: Intent.AdBlocker_Enable,
                });
            } else {
                $("#remAds").prop("checked", false).trigger("change");
            }
        });
    } else {
        chrome.storage.local.set({
            remAds: false,
        });
        chrome.runtime.sendMessage({
            intent: Intent.AdBlocker_Disable,
        });
        // FIXME: <all_urls> can't be removed because of required origins for 9anime urls
        chrome.permissions.remove({
            permissions: perms.permissions,
        });
    }
}

function enableMalLogin() {
    malLoggedInStatus.text("Not logged-in");
    malUsernameInput.removeAttr("disabled");
    malPasswordInput.removeAttr("disabled");
    malLoginBtn.show();
    malResetButton.hide();
}

function disableMalLogin() {
    malLoggedInStatus.text("Logged-in");
    malUsernameInput.attr("disabled", "disabled");
    malPasswordInput.attr("disabled", "disabled");
    malLoginBtn.hide();
    malResetButton.show();
}

// --- Event Listeners ---
$("#mal-configure__form").on("submit", e => {
    e.preventDefault();

    // Disable the login button, username and password field
    // and start showing the loader
    malLoginBtn.attr("disabled", "disabled");
    malUsernameInput.attr("disabled", "disabled");
    malPasswordInput.attr("disabled", "disabled");
    malLoginProgress.empty().append(`<img src="images/loader.svg">`);

    let malUsername = malUsernameInput.val();
    let malPassword = malPasswordInput.val();
    if (malUsername && malPassword) {
        // First we verify that the username and password
        // are indeed legit. After we get a response, we
        // store it in the chrome.local storage.
        chrome.runtime.sendMessage({
            intent: Intent.MAL_VerifyCredentials,
            password: malPassword,
            username: malUsername,
        }, (resp: IRuntimeResponse) => {
            if (resp.success) {
                // Yeay! Success
                chrome.storage.local.set({
                    malPassword,
                    malUsername,
                });
                malLoginProgress.empty().append(`<img src="images/check-mark.png">`);
                disableMalLogin();
            } else {
                malLoginProgress.empty().append(`<img src="images/x-mark.png">`);
                // console.log(resp.err);
            }

            // Cleanup!
            malLoginBtn.removeAttr("disabled");
            malUsernameInput.removeAttr("disabled");
            malPasswordInput.removeAttr("disabled");
        });
    }
});

malResetButton.on("click", () => {
    chrome.runtime.sendMessage({
        intent: Intent.MAL_RemoveCredentials,
    }, () => {
        chrome.storage.local.set({
            malPassword: "",
            malUsername: "",
        });
        enableMalLogin();
    });
});

adBlockApplyBtn.on("click", () => {
    let temp = String(adBlockFiltersInput.val()).trim().split("\n");
    let filterList = [];
    for (let item of temp) {
        if (item) {
            filterList.push(item.trim());
        }
    }

    adBlockApplyBtn.attr("disabled", "disabled");
    adBlockProgress.empty().append(`<img src="images/loader.svg">`);

    chrome.runtime.sendMessage({
        intent: Intent.AdBlocker_UpdateFilter_Local,
        filterList,
    }, resp => {
        if (resp.success) {
            adBlockApplyBtn.removeAttr("disabled");
            adBlockProgress.empty().append(`<img src="images/check-mark.png">`);
        }
    });
});

/* --- AntiAdblock --- */
/*const getUpdatedDetection = async () => {
    try {
        const resp = await fetch("https://github.com/lap00zza/9anime-Companion/raw/master/scripts/antiAdblock.json");
        if (!resp.ok) {
            throw new Error(resp.status.toString());
        }
        return await resp.json();
    } catch (err) {
        throw new Error(err.message);
    }
};

const aabStatus = $("#antiAdblockStatus");
const aabUpdateBtn = $("#antiAdblockUpdate");
chrome.storage.local.get("antiAdblock", r => {
    if (r.antiAdblock) {
        aabStatus.text("last definition update: " + r.antiAdblock.lastUpdated);
    }
});
aabUpdateBtn.on("click", () => {
    aabUpdateBtn.attr("disabled", "disabled").text("Updating...");
    getUpdatedDetection()
        .then(r => {
            chrome.storage.local.set({
                antiAdblock: r,
            });
            aabStatus.text("Done. last definition update: " + r.lastUpdated);
            aabUpdateBtn.removeAttr("disabled").text("Update");
        })
        .catch(() => {
            aabStatus.text("Update failed. Try again later.");
            aabUpdateBtn.removeAttr("disabled").text("Update");
        });
});*/
/* --- ~~~ --- */

// (<any> window).$ = $;
