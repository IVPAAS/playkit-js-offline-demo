
importScripts("idb-keyval.js");



var cacheName = 'testApp';
var number = 0;


self.addEventListener('install', function(event) {
    // Perform install steps
    event.waitUntil(
        caches.open(cacheName).then(function(cache) {
            return cache.addAll(
                [
                 'https://qa-apache-php7.dev.kaltura.com/p/1091/sp/109100/playManifest/entryId/0_wifqaipd/protocol/https/format/mpegdash/flavorIds/0_m131krws,0_kozg4x1x/a.mpd',
                 'https://cdnapisec.kaltura.com/p/1982551/sp/198255100/playManifest/entryId/0_mr1qse99/format/mpegdash/tags/dash/protocol/https/f/a.mpd',
                 'https://qa-apache-php7.dev.kaltura.com/p/4171/sp/417100/playManifest/entryId/0_4s6xvtx3/protocol/https/format/mpegdash/flavorIds/0_kl0tqbr3,0_t0bg9cqj,0_912xg2u3/a.mpd',
                 'index.html',
                 'shaka-player.compiled.js',
                 'myapp.js',
                'utils.js',
                'idb-keyval.js',
                'license-persister.js',
                'dash.js'
                ]
            );
        })
    );
});


self.addEventListener('activate', function(event) {
    self.clients.claim();
});


self.addEventListener('backgroundfetched', onBackgroundFetched);


self.addEventListener('message', onMessage);

self.addEventListener('fetch', onfetch)


function onfetch (event){
    console.log("Request -->", event.request.url);
    var url = event.request.url;
    url = url.replace(/^http:\/\//i, 'https://');
    //To tell browser to evaluate the result of event
    event.respondWith(
        caches.match(url) //To match current request with cached request it
            .then(function(response) {
                //If response found return it, else fetch again.
                if (response){
                    console.log("found response: " + response.url);
                    return response;
                }else{
                    return fetch(event.request)
                }
            })
            .catch(function(error) {
                console.error("Error: ", error);
            })
    );

}


function onMessage(message){
    var action = message.data.action;
    switch(action){
        case "backgroundfetch":
            try{
                backgroundFetchWrapper(message.data);
            }catch(e){
                console.log("backgroundFetchWrapper error "+ e);
                var message = {
                    action: "error",
                    info: ("backgroundFetchWrapper error " + e)
                };
                client.postMessage(message);
            }

            break;
        case "remove":
            removeFromCache(message.data);
            break;
        default:
            console.log("unknown action");
    }

}

function removeFromCache(message) {
    var tag = message.tag;
    if (!tag){
        console.error("removeFromCache: no id to delete")
    }

    caches.keys().then(function(cacheNames) {
        return Promise.all(
            cacheNames.map(function(cacheName) {
                if(cacheName == tag) {
                    return caches.delete(cacheName);
                }
            })
        );
    });

}


function backgroundFetchWrapper(message){
    // Store the assets that are being background fetched because there may be
    // a teardown in the SW and the responses will need to be hooked back
    // up when the responses come in.
    var tag = message.tag || "movie1";
    var assets = message.requests;

    idbKeyval.set('bg-' + tag, assets);


    console.log("ServiceWorker - postMessage recieved" + message);

    if (!self.registration.active) {
        return;
    }

    console.log('Asking SW to background fetch assets');


    self.registration.backgroundFetch.fetch(tag, assets, {});


}




function onBackgroundFetched (evt) {
    var tag = evt.id;
    console.log("backgroundFetched - done");
    idbKeyval.get('bg-' + tag).then(function (assets) {
        if (!assets) {
            console.error('Unknown background fetch.');
            return;
        }

        console.log(assets);

        return caches.open(tag).then(function (cache) {
            var fetches = evt.fetches;
            return Promise.all(assets.map(function (asset) {
                var fetch = fetches.find(function (r) {
                    return r.response.url === asset || r.response.url.endsWith(asset);
                });

                if (!fetch) {
                    console.log('Unable to find response for ' + asset);
                    return;
                }

                var response = fetch.response;
                if (asset) {
                    return cache.put(asset, response);
                }

                //return Utils.cacheInChunks(cache, response);
            }));
        }).then(function () {
            notifyAllClients({
                offline: true,
                success: true,
                name: tag,
                action: "backgroundfetch",
                info: "success"
            });

            teardown(tag);
        }).catch(function(e){
            console.log("backgroundFetchWrapper error "+ e);
            var message = {
                action: "error",
                info: ("backgroundFetchWrapper error " + e)
            };
            client.postMessage(message)
        })

        ;



    });
}

function notifyAllClients (msg) {
    self.clients.matchAll().then(function (clients) {
        clients.forEach(function (client) {
            console.log(msg, client);
            client.postMessage(msg);
        });
    });
};

function  teardown (tag) {
    var tag = tag ||  "movie";
    return idbKeyval.delete("bg-"+tag);
}