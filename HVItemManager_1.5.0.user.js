// ==UserScript==
// @name        HV Item Manager
// @namespace   hentaiverse.org
// @description	Bazaar, Moogle, Filter and Manage your items
// @match         http://*.hentaiverse.org/?s=Character*
// @match         http://*.hentaiverse.org/?s=Bazaar*
// @match         http://*.hentaiverse.org/?s=Battle&ss=iw*
// @match         http://*.hentaiverse.org/?s=Forge*
// @start-at   document-end
// @version     1.5.0
// @author      holy_demon
// ==/UserScript==
//changelog from 1.2.0
//- future update:
//- data store in indexedDB 
//- autocomplete history
//- 1.5.0:
//- auto Shrine
//- change the input boxes to expand on input
//- 1.4.4:
//- compatibility with HV0.82
//- read info from Soulbound correctly
//- add parameter $trade(tradeable, untradeable, or soulbound), $tier(1-10), $level(0 if unassigned or soulbound)
//- 1.4.3:
//- uncheck equip after doing bazzaar/moogle/reforge/salvage
//- unlock before moogling, as item locked state is carried over between owners
//- auto-unlock and relock item when reforging.
//- double-check for bazzaaring and salvaging IWed equips
//- 1.4.2:
//- $url of item will link to item shop
//- support custom name, and suffix-less equip
//- slower MoogleMail to ensure correctness.
//- space bar/enter hotkey with popup/modal box
//- listing is properly ordered
//- fix bug: mailform's autocomplete histor, cryptic error when clicked on filter, capital M/K in price tag converted correctly
//- 1.4.1:
//- list shows available tag
//- too many bug fixes
//- 1.4.0:
//- bug fix: obsolete equipments
//- modified look&field
//- reorganised engine code
//- clearer error notification
//- COD function 
//- faster filter function
//- List function now works with items and consumables
//- $aprice(abbreviated price): price as you type (eg: 500k, 2.5m) , $price: price in number form (eg: 500000,2500000)
//- 1.3.1: better alert system
//- $<tag><number> return the first <number> letter of the tag. eg: $quality4 will return Supe, Exqu, Peer, Lege, etc...
//- $aquality: abbreviated quality
//- 1.3.0: reforge
//- itemworld
//- move menu box with right click
//- can select by clicking on item, instead of just ticking a rather small checkbox
//- price all only change price of selected items
//- stronger filter function with conditionals.
//- filter syntax: '-' to get negative, use $<tag_name> to filter by tag, each conditional is separated by ',' (comma) 
//eg: "Power|Phase|Shade|Force, $pxp<320" only display equips that contain Power/Phase/Shade/Force in name and pxp must be <320
//"-$locked, $cond<75" only display unlocked items with condition < 75
//"-Slaughter|Destruction, level==10" only display equips that don't coin Slaughter/Destruction in their name and level 10
//-support new tag $# (count starting from 1) $cond (for condition) and $locked (return true if item is locked), $pxp now returns a number or MAX

function HVItemHelper() {
//   document.querySelectorAll("tbody")[2].lastElementChild.querySelector(".fd4>div").textContent = "Over 9000";
   if (!document.querySelector(".cspp:not(#stats_pane)")) {
      return false;
   }
   var cssStyle = document.head.appendChild(document.createElement("style"));
   function addCSSRule(rule) {
      cssStyle.sheet.insertRule(rule, 0);
   }

   var TAGS = ["$name", "$url", "$price", "$aprice", "$count", "$id", "$class", "$level", "$trade", "$cond", "$tier", "$pxp", "$type", "$atype", "$quality", "$aquality", "$prefix", "$stype", "$part", "$suffix"];
   function Engine() {

      addCSSRule(".hidden {display: none;}");


      var EQUIP_FILTER_LOOKUP = {"One-handed": "1handed", "Two-handed": "2handed", "Staff": "staff", "Shield": "shield", "Cloth": "acloth", "Light": "alight", "Heavy": "aheavy"};
      var EQUIP_ABBR_LOOKUP = {"One-handed": "1H", "Two-handed": "2H", "Staff": "ST", "Shield": "SH", "Cloth": "CL", "Light": "LI", "Heavy": "HE"};
      var QUALITY_ABBR_LOOKUP = {"Crude": "Crd", "Fair": "Fair", "Average": "Avg", "Fine": "Fine", "Superior": "Sup", "Exquisite": "Exq", "Magnificent": "Mag", "Legendary": "Leg", "Peerless": "Peer"};
      var EQUIP_TYPES = ["Axe", "Club", "Rapier", "Shortsword", "Wakizashi", "Dagger", "Sword Chucks",
         "Estoc", "Longsword", "Mace", "Katana", "Scythe",
         "Oak", "Redwood", "Willow", "Katalox", "Ebony",
         "Buckler", "Kite", "Force", "Tower",
         "Cotton", "Phase", "Gossamer", "Silk",
         "Leather", "Shade", "Kevlar", "Dragon Hide",
         "Plate", "Power", "Shield", "Chainmail",
         "Gold", "Silver", "Bronze", "Diamond", "Emerald", "Prism", "Platinum", "Steel", "Titanium", "Iron"];
      var ajax = {moogle: new FormAJAX("?s=Bazaar&ss=mm&filter=new", true),
         lock: new FormAJAX("rpc/rpc_equip.php"),
         bazaar: new FormAJAX("?s=Bazaar&ss=es"),
         iw: new FormAJAX("?s=Battle&ss=iw"),
         forge: new FormAJAX("?s=Forge"),
         shrine: new FormAJAX("?s=Bazaar&ss=ss")
      };
      this.pane_item = document.querySelector("#inv_item,#pane_item,#item_pane");
      this.pane_equip = document.querySelector("#inv_equip,#pane_equip,#leftpane #item_pane");
      this.items = document.querySelectorAll(".cspp tr");
      this.equips = document.querySelectorAll(".eqpp, .eqp");
      this.cash = {page: {}, cur: {}};
      this.cash.page.credit = this.cash.cur.credit = parseInt(document.querySelectorAll("tbody")[2].lastElementChild.querySelector(".fd4>div").textContent);
      this.index = {};
      this.store = JSON.parse(localStorage.HVItemHelper || "null");

      if (!this.store || !this.store.price) {
         this.store = {price: {}};
      }
      if (!this.store.templates) {
         this.store.templates = {filter: "", list: "", recipient: "", subject: "$name", body: "[url=$url]$name[/url]"};
      }

      this.sync = function sync() {
         localStorage.HVItemHelper = JSON.stringify(this.store);
      };

      this.getId = function getId(elem) {
         return (elem.id || elem.querySelector("div[id]").id).replace(/(\d*).*/, "$1");
      };

      this.infoCounter = 0;

      this.indexInfo = function indexInfo() {
         var ITEM_NAME_REGEXP = new RegExp("show_popup_box\\(.+\\d+,'([^,]+)',");
         var EQUIP_NAME_REGEXP = new RegExp("([\\w-]+) ([\\w-]*?) ?(" + EQUIP_TYPES.join('|') + ") ?((?!of)\\w*) ?((?=of)[\\w- ]*|$)");
         var EQUIP_HEADER_REGEXP = new RegExp("class=\"e1\">([\\w-]*)(?:(?:.*?Level (\\d+|Unassigned))?.*?(Soulbound|Tradeable|Untradeable))?.*?Condition.*?(\\d*)%.*?Potency Tier: (\\d+).*?(\\d+|MAX)\\)</div>");
         var EQUIP_LINK_REGEXP = new RegExp("equips.set\\((\\d+).*'(.+?)'\\)");
         var ITEM_QUALITY_REGEXP = new RegExp("(Lesser|Average|Greater|Heroic|\\w*(-Grade)|Scrap)?");
         for (var i = 0; i < this.equips.length; i++) {//equips
            try {
               var str = this.equips[i].querySelector("[onmouseover]").getAttribute("onmouseover");
               var name = str.match(ITEM_NAME_REGEXP)[1];
               var match0 = name.match(EQUIP_NAME_REGEXP) || [];
               var match1 = str.match(EQUIP_HEADER_REGEXP) || [];
               var match2 = str.match(EQUIP_LINK_REGEXP) || [];
               var id = match2[1];
               this.index[id] = {name: name, price: this.getPriceNumber(id), aprice: this.getPrice(id), count: 0,
                  id: id, key: match2[2], url: 'http://hentaiverse.org/pages/showequip.php?eid=' + match2[1] + '&key=' + match2[2], elem: this.equips[i],
                  class: "equip", type: match1[1], atype: EQUIP_ABBR_LOOKUP[match1[1]],
                  level: parseInt(match1[2]) || 0, trade: match1[3], cond: parseInt(match1[4]), tier: parseInt(match1[5]), pxp: match1[6],
                  quality: match0[1] || "", aquality: QUALITY_ABBR_LOOKUP[match0[1]] || "",
                  prefix: match0[2] || "", stype: match0[3] || "", part: match0[4] || "", suffix: match0[5] || ""};
            } catch (ignored) {
               console.log("broken equip", this.equips[i], name, match0, match1, match2, ignored);
            }
         }

         for (var i = 0; i < this.items.length; i++) {//items
            try {
               var str = this.items[i].querySelector("[onmouseover]").getAttribute("onmouseover");
               var id = this.getId(this.items[i]);
               var name = str.match(ITEM_NAME_REGEXP)[1];
               var match0 = name.match(ITEM_QUALITY_REGEXP) || [];
//            "Greater Health Potion".match(/(Lesser|Average|Greater|Heroic|\w*(-Grade)|Scrap)? ?(.* ?(Potion|Elixir|Figurine|Crystal|Metal|Wood|Leather|Cloth|Artifact|Token|Shard|Catalyst|Coin|Ponyfeather))|((Binding|Scroll) of (\w+))/)            
               var match1 = str.match(/'(.+)','.*'\)/);
               this.index[id] = {name: name, price: this.getPriceNumber(id), aprice: this.getPrice(id), count: 0,
                  id: id, key: "", url: "http://hentaiverse.org/?s=Bazaar&ss=is", elem: this.items[i],
                  class: "item", type: match1[1], quality: match0[1]};
            } catch (ignored) {
               console.log("broken item", this.items[i], ignored);
            }
         }
      };

      //update lock state and count
      this.getInfo = function getInfo(what) {
         var elem, id;
         if (typeof what === "object") {
            elem = what;
            id = this.getId(elem);
         } else {
            id = what;
            elem = this.getElem(id);

         }
         var info = this.index[id];
         if (elem.tagName === "DIV") {
            info.locked = Boolean(elem.querySelector(".il,.ilp"));
         }
         info["#"] = this.infoCounter++;
         return info;
      };

      this.get = function get(id, what) {
         return this.index[id][what];
      };

      this.getName = function getName(id) {
         return this.index[id].name;
      };

      this.setText = function setText(id, text) {
         this.getElem(id).querySelector(".fd2 div").textContent = text;
      };

      this.getText = function getText(id) {
         return this.getElem(id).querySelector(".fd2 div").textContent;
      };

      this.getElem = function getElem(id) {
         return this.index[id].elem;
      };

      this.getCount = function getCount(id) {
         return this.index[id].count;
      };

      this.getClass = function getClass(id) {
         return this.index[id].class;
      };

      this.setCount = function setCount(id, count) {
         this.index[id].count = Number(count);
      };

      this.getPrice = function getPrice(id) {
         return this.store.price[id] || "";
      };

      this.getPriceNumber = function getPriceNumber(id) {
         var match = /^([\d\.]*)(\w*)/.exec(this.getPrice(id).toString().toLowerCase());
         var total = Number(match[1]);
         for (var i = 0; i < match[2].length; i++) {
            if (match[2][i] === "k") {
               total *= 1000;
            } else if (match[2][i] === "m") {
               total *= 1000000;
            }
         }
         return total;
      };

      this.setPrice = function setPrice(id, price) {
         this.index[id].aprice = this.store.price[id] = price;
         this.index[id].price = this.getPriceNumber(id);
         if (!price) {
            delete this.store.price[id];
         }
         this.sync();
      };

      this.getTemplate = function getTemplate(type) {
         return this.store.templates[type];
      };
      this.getListTemplate = this.getTemplate.bind(this, "list");
      this.getFilterTemplate = this.getTemplate.bind(this, "filter");

      this.setTemplate = function setTemplate(type, template) {
         this.store.templates[type] = template;
      };
      this.setListTemplate = this.setTemplate.bind(this, "list");
      this.setFilterTemplate = this.setTemplate.bind(this, "filter");

      this.setMailTemplate = function(recipient, subject, body) {
         this.store.templates["recipient"] = recipient;
         this.store.templates["subject"] = subject;
         this.store.templates["body"] = body;
      };


      this.getFormattedText = function getFormattedText(id, template) {
         var info = this.getInfo(id);
         text = template.replace(/\$([a-z\#]+)(\d*)/gi, function(match, tag, prefix) {
            return String(info[tag.toLowerCase()]).substr(0, prefix || undefined);
         });
         return text;
      };

      this.setFilter = function setFilter(filter) {
         this.setFilterTemplate(filter = filter.toLowerCase());
         var filters = filter.split(/\s*[,;]+\s*/);
         var info;

         for (var id in this.index) {
            info = this.getInfo(id);
            this.getElem(id).classList.remove("hidden");
            if (this.getCount(id)) {
               this.setCount(id, 0);
               this.getElem(id).querySelector(".item_select,.equip_select")[this.getClass(id) === "equip" ? "checked" : "value"] = "";
            }
            for (var j = 0; j < filters.length && !this.getElem(id).classList.contains("hidden"); j++) {
               var match = filters[j].match(/([\+\-])?(.+)/);

               try {
                  var type = match[1], pattern = match[2], matched;
                  if (/\$\w+/.test(pattern)) {
                     matched = eval(pattern.replace(/\$([a-z\#]+)(\d*)/gi, function(match, tag, prefix) {
                        if (!info.hasOwnProperty(tag))
                           throw "Tags not supported";
                        if (typeof info[tag] === "string") {
                           return "'" + String(info[tag]).substr(0, prefix || undefined).toLowerCase() + "'";
                        } else
                           return String(info[tag]);

                     }));
                  } else {
                     matched = RegExp(pattern, "i").test(this.getName(id));
                  }
                  matched = type === "-" ? !matched : matched;

               } catch (ignored) {
                  matched = true;
               }


               if (!matched) {
                  this.getElem(id).classList.add("hidden");
               }

            }
         }

         document.querySelector("#equip_all").checked = false;
         document.querySelector("#item_all").value = "";

      };

      this.setPostkey = function setPostkey(key) {
         if (key) {
            this.store.postKey = key;
            this.sync();
         } else if (!this.store.postKey) {
            ajax.moogle.submit("", true, false);
         }
      };

      this.getPostKey = function getPostKey() {
         return this.store.postKey;
      };

      this.moogle = function(recipient, id, type, count, cod, subj, body) {
         console.log("start moogling", recipient, id, type, count, cod, subj, body);
         if (this.getPostKey()) {
            if (this.get(id, "locked")) {
               ajax.moogle.submit({act: "toggle_lock", eid: id, val: 0}, true, false, "GET", ajax.lock.getPath());
            }
            if (id && count > 0) {
               ajax.moogle.submit({postkey: this.getPostKey(), action: "attach_add", select_item: id, select_count: count, select_pane: type}, true, false, "POST");
               if (cod > 0) {
                  ajax.moogle.submit({postkey: this.getPostKey(), action: "attach_cod", action_value: cod}, true, false, "POST");
               }
            }
            ajax.moogle.submit({postkey: this.getPostKey(), action: "send", select_item: id, message_to_name: recipient, message_subject: subj, message_body: body}, true, false, "POST");
         }
      };
      this.bazaar = function(id, count) {
         console.log("start selling", id, count);
         ajax.bazaar.submit({select_mode: "item_pane", select_item: id, select_count: count}, false, false, "POST");
      };

      this.iw = function(id) {
         console.log("start IW", id);
         var info = this.getInfo(id);
         ajax.iw.submit({select_item: id}, false, false, "POST", ajax.iw.getPath() + "&filter=" + EQUIP_FILTER_LOOKUP[info.type]);
         document.addEventListener("ajaxload", function() {
            window.location.href = ajax.iw.getPath() + "&filter=" + EQUIP_FILTER_LOOKUP[info.type];
         }, true);
      };

      this.salvage = function(id) {
         console.log("start salvaging", id);
         var info = this.getInfo(id);
         ajax.forge.submit({select_item: id}, false, false, "POST", ajax.forge.getPath() + "&ss=sa&filter=" + EQUIP_FILTER_LOOKUP[info.type]);
      };

      this.repair = function(id) {
         console.log("start repairing", id);
         var info = this.getInfo(id);
         ajax.forge.submit({select_item: id}, false, false, "POST", ajax.forge.getPath() + "&ss=re&filter=" + EQUIP_FILTER_LOOKUP[info.type]);
      };

      this.reforge = function(id) {
         console.log("start reforging", id);
         var info = this.getInfo(id);
//         if (info.locked) {
//            ajax.forge.submit({act: "toggle_lock", eid: id, val: 0}, true, true, "GET", ajax.lock.getPath());
//         }
         ajax.forge.submit({select_item: id}, true, false, "POST", ajax.forge.getPath() + "&ss=fo&filter=" + EQUIP_FILTER_LOOKUP[info.type]);
//         if (info.locked) {
//            ajax.forge.submit({act: "toggle_lock", eid: id, val: 1}, false, true, "GET", ajax.lock.getPath());
//         }
      };

      //lock set to true to toggle lock, false to toggle unlock
      this.lockToggle = function(id, lock) {
         console.log("locking", id, lock);
         ajax.lock.submit({act: "toggle_lock", eid: id, val: Number(lock)}, false, true, "GET");
      };

      this.shrine = function(id, reward) {
         ajax.shrine.submit({select_item: id, select_reward: reward}, false, false, "POST");
      };
      this.indexInfo();
   }

   function FormAJAX(path) {
      var MAX_CONN = 20;
      var forms = [];
      var lastIter = 0;
      var lastSent = -1;
      var result = null;

      function paramText(form) {
         var line = "";
         for (var name in form) {
            line += ((line.length > 1) ? "&" : "") + name + "=" + encodeURIComponent(form[name]);
         }
         return line;
      }

      this.getPath = function getPath() {
         return path;
      };

      function push(param, sync, skip, type, path) {
         forms.push({param: param, sync: sync, skip: skip, type: type, path: path});
         if (lastIter === forms.length - 1) {
            post(lastIter);
         }
      }


      function refresh() {
         forms = [];
         push("", false);
      }

      function post(iter) {
         var xmlhttp = new XMLHttpRequest();
         var param = typeof forms[iter].param === "string" ? forms[iter].param : paramText(forms[iter].param);
         var type = forms[iter].type;
         xmlhttp.open(type, (forms[iter].path || path) + (type === "GET" ? "?" + param : ""), true);
         xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
         xmlhttp.responseType = "document";
         xmlhttp.timeout = 10000;
         xmlhttp.onreadystatechange = function() {
            if (xmlhttp.status === 200) {
               lastSent = Math.max(lastSent, iter);
               if (xmlhttp.readyState === 2) {
                  if (iter === lastIter) {
                     lastIter++;
                     if (lastIter < forms.length) {
                        post(lastIter);
                     }
                  }

                  if (forms[iter].skip && iter < forms.length - 1) {
                     xmlhttp.abort();
                     var event = new CustomEvent("ajaxskip", {detail: {iter: iter, lastIter: forms.length - 1, response: null, path: path, param: forms[iter].param}});
                     document.dispatchEvent(event);
                  }

               } else if (xmlhttp.readyState === 4 && xmlhttp.response) {
                  result = xmlhttp.response;
                  console.log("done", iter, lastIter, forms.length, xmlhttp.response);
                  var event = new CustomEvent("ajaxload", {detail: {iter: iter, lastIter: forms.length - 1, response: xmlhttp.response, path: path, param: forms[iter].param}});
                  document.dispatchEvent(event);
                  xmlhttp.abort();
               }
            } else if (xmlhttp.readyState === 2) {
               console.log("fail and resend", iter, lastIter, forms.length, param, xmlhttp.status, xmlhttp.readyState);
               xmlhttp.abort();
               window.setTimeout(function() {
                  post(iter);
               }, 2000);
            }
         };
         xmlhttp.send(param);
         if (iter === lastIter && lastIter < forms.length - 1 && !forms[iter].sync && lastIter - lastSent < MAX_CONN) {
            lastIter++;
            post(lastIter);
         }

      }

      this.submit = function submit(param, sync, skip, type, path) {
         push(param, sync, skip, type, path);
         return true;
      };

      this.getResult = function getResult() {
         return result;
      };

      this.reset = function reset() {
         forms = [];
         lastIter = 0;
      };

   }


   function createToolbox() {
      addCSSRule(".item_toolbox{position: fixed; display: block; border: 2px solid; padding:2px; background: #EDEBDF; width:140px; left: 5px; top: 5px; z-index: 10; color:#5C0D12; font: bold normal 16px 'Arial';}");
      addCSSRule(".item_toolbox button {width:65px; cursor:pointer; z-index:inherit; font: bolder normal 14px 'Consolas';}");
      addCSSRule(".item_toolbox input,.item_toolbox textarea{font: normal normal 15px 'Consolas';}");
      addCSSRule(".item_modal {position: absolute; display:block; border:inherit; padding:2px; background:inherit; left: 144px; top: 0px; width:280px; z-index:inherit; font: bolder normal 16px 'Arial';}");
      addCSSRule(".item_modal button {float:left}");

      var toolbox = document.querySelector(".item_toolbox") ||
              document.body.appendChild(document.createElement("form"));
      toolbox.className = "item_toolbox";
      toolbox.id = "item_manager";
      toolbox.autocomplete = "on";
      toolbox.onsubmit = function() {
         return false;
      };

      engine.setPostkey();

      document.addEventListener("keydown", function(e) {
         if (e.ctrlKey && String.fromCharCode(e.keyCode) === 'F') {
            e.preventDefault();
            toolbox.querySelector("#item_filter").select();
         } else if (e.keyCode === 27) {
            var button = toolbox.querySelector("#item_cancel");
            if (button)
               button.click();
            else {
               toolbox.querySelector("#item_filter").value = "";
               engine.setFilter(textfield.value);
            }
         } else if ((e.keyCode === 13 || e.keyCode === 32) && e.target.type === "button") {
            e.target.click();
         }
      }, true);

      document.addEventListener("contextmenu", function(e) {
         if (e.button === 2 && !e.shiftKey && !e.altKey && !e.ctrlKey) {
            toolbox.style.left = e.clientX + "px";
            toolbox.style.top = e.clientY + "px";
            e.preventDefault();
         }

      }, true);

      document.addEventListener("ajaxload", function(e) {
         if (e.detail.response) {
            if (!engine.getPostKey() && e.detail.response.getElementById("postkey")) {
               engine.setPostkey(e.detail.response.getElementById("postkey").value);
               console.log("postkey", engine.getPostKey());
            }
            var id = e.detail.param["select_item"];
            console.log("received", e, id);

            if (id) {
               var msgbox = e.detail.response.querySelectorAll("#messagebox .cmb6:not(:first-child),.emsg");


               if (msgbox.length > 0) {
                  var message = engine.getText(id);
                  for (var i = 0; i < msgbox.length; i++) {
                     message = msgbox[i].textContent.replace(/Salvaged|Hit Space Bar.*|Received.?|\n/g, "") + "\n"+ message;
                  }
               } else {
                  var message = e.detail.response.querySelector(".clb").textContent.match(/^Item.*\.$/mi);
                  message = message ? message.toString() : e.detail.response.querySelector("#recoverform") ? engine.getText(id).replace(/^Done |^/, "Done ") : "In Battle";
               }

               engine.setText(id, message);
            }
         }
      }, false);
      return toolbox;

   }

   function createFilterField() {

      var textfield = toolbox.appendChild(document.createElement("input"));
      textfield.id = "item_filter";
      textfield.name = "filter";
      textfield.type = "search";
      textfield.autocomplete = "on";
      textfield.placeholder = "Enter item filter";
      textfield.size = 15;
      textfield.value = engine.getFilterTemplate();


      textfield.oninput = function() {
         this.size = 80;
         engine.setFilter(this.value);
      };

      textfield.onfocus = function() {
         engine.setFilter(this.value);
      };

      textfield.onblur = function() {
         this.size = 15;
      }

      textfield.onclick = textfield.select;

      textfield.addEventListener("keyup", function(e) {
         e.stopPropagation();
      }, true);

      textfield.addEventListener("keydown", function(e) {
         e.stopPropagation();
      }, true);

      textfield.addEventListener("keypress", function(e) {
         e.stopPropagation();
      }, true);

   }

   function createEquipsInputs() {
      addCSSRule(".equip_select {cursor:pointer; position:absolute; left:410px; z-index:9;}");
//      addCSSRule(".equip_select:checked:after {content: '\2714';}");
      addCSSRule(".equip_price {position:absolute; left:450px; z-index:9;}");
      addCSSRule("#equip_all {position:absolute; top: 5px;}");

      //Input all
      var checkboxAll = document.createElement("input");
      var equips = engine.pane_equip.querySelectorAll(".eqp, .eqpp");
      checkboxAll.className = "equip_select";
      checkboxAll.type = "checkbox";
      checkboxAll.id = "equip_all";
      checkboxAll.setAttribute("form", "item_manager");
      checkboxAll.checked = false;

      checkboxAll.onchange = function() {
         for (var i = 0; i < equips.length; i++) {
            equips[i].querySelector(".equip_select").checked = this.checked && !equips[i].classList.contains("hidden");
            equips[i].querySelector(".equip_select").onchange();
         }
      };

      var pricefieldAll = document.createElement("input");
      pricefieldAll.className = "equip_price";
      pricefieldAll.type = "text";
      pricefieldAll.id = "equip_all";
      pricefieldAll.setAttribute("form", "item_manager");
      pricefieldAll.value = "";
      pricefieldAll.size = 5;
      pricefieldAll.placeholder = "selected";

      pricefieldAll.oninput = function() {
         for (var i = 0; i < equips.length; i++) {
//            if (!equips[i].classList.contains("hidden")) {
            if (engine.getCount(engine.getId(equips[i])) > 0) {
               equips[i].querySelector(".equip_price").value = this.value;
               equips[i].querySelector(".equip_price").oninput();
            }
         }
      };

      pricefieldAll.onfocus = function() {
         this.size = 15;
         this.oninput();
      };

      pricefieldAll.onblur = function() {
         this.size = 5;
      }

      engine.pane_equip.appendChild(checkboxAll);
      engine.pane_equip.appendChild(pricefieldAll);

      function onChangeCheckbox() {
         engine.setCount(this.id, this.checked);
      }
      function onClickCheckbox() {
         var checkbox = this.parentNode.querySelector(".equip_select");
         checkbox.checked = !checkbox.checked;
         checkbox.onchange();
      }
      function onInputPricefield() {
         engine.setPrice(this.id, this.value);
      }


      //input each
      for (var i = 0; i < equips.length; i++) {
         var checkbox = checkboxAll.cloneNode(false);
         checkbox.id = engine.getId(equips[i]);
         checkbox.checked = false;

         checkbox.onchange = onChangeCheckbox;
         equips[i].querySelector(".eqdp").addEventListener("click", onClickCheckbox, true);

         var pricefield = pricefieldAll.cloneNode(false);
         pricefield.id = checkbox.id;
         pricefield.value = engine.getPrice(pricefield.id) || "";
         pricefield.placeholder = "price";

         pricefield.oninput = onInputPricefield;
         pricefield.onfocus = pricefieldAll.onfocus;
         pricefield.onblur = pricefieldAll.onblur;


         equips[i].appendChild(checkbox);
         equips[i].appendChild(pricefield);
      }
   }

   function createItemsInputs() {
      //Input all
      addCSSRule(".item_select {left:0px; z-index:9;}");
      addCSSRule(".item_price {left:40px; z-index:9;}");
      addCSSRule("#item_all {position:absolute; top: 5px;}");

      var items = engine.pane_item.querySelectorAll(".cspp tr");

      var countfieldAll = document.createElement("input");
      countfieldAll.className = "item_select";
      countfieldAll.type = "text";
      countfieldAll.id = "item_all";
      countfieldAll.setAttribute("form", "item_manager");
      countfieldAll.value = "";
      countfieldAll.size = 1;
      countfieldAll.placeholder = "all";

      countfieldAll.oninput = function() {
         for (var i = 0; i < items.length; i++) {
            if (!items[i].classList.contains("hidden")) {
               items[i].querySelector(".item_select").value = this.value;
               items[i].querySelector(".item_select").oninput();
            }
         }
      };

      var pricefieldAll = countfieldAll.cloneNode(false);
      pricefieldAll.className = "item_price";
      pricefieldAll.setAttribute("form", "item_manager");
      pricefieldAll.placeholder = "selected";
      pricefieldAll.oninput = function() {
         for (var i = 0; i < items.length; i++) {
            if (engine.getCount(engine.getId(items[i])) > 0) {
               items[i].querySelector(".item_price").value = this.value;
               items[i].querySelector(".item_price").oninput();
            }
         }
      };
      pricefieldAll.onfocus = function() {
         this.size = 10;
         this.oninput();
      };

      pricefieldAll.onblur = function() {
         this.size = 1;
      }
      engine.pane_item.appendChild(countfieldAll);
      engine.pane_item.appendChild(pricefieldAll);


      function onInputCountfield() {
         engine.setCount(this.id, this.value);
      }

      function onInputPricefield() {
         engine.setPrice(this.id, this.value);
      }

      //input each
      for (var i = 0; i < items.length; i++) {
         var countfield = countfieldAll.cloneNode(false);
         countfield.id = engine.getId(items[i]);
         countfield.value = "";
         countfield.placeholder = "count";

         countfield.oninput = onInputCountfield;

         var pricefield = pricefieldAll.cloneNode(false);
         pricefield.id = engine.getId(items[i]);
         pricefield.value = engine.getPrice(pricefield.id) || "";
         pricefield.placeholder = "price";

         pricefield.oninput = onInputPricefield;
         pricefield.onfocus = pricefieldAll.onfocus;
         pricefield.onblur = pricefieldAll.onblur;

         items[i].querySelector("td").insertBefore(pricefield, items[i].querySelector("[id]"));
         items[i].querySelector("td").insertBefore(countfield, items[i].querySelector("[id]"));
      }
   }

   function createButtons() {

      //Input all

      var buttonList = {"Moogle": function() {
            createModalDialog("Moogle Form", [{rows: 1, cols: 30, placeholder: "Recipient", name: "recipient", value: engine.getTemplate("recipient")},
               {rows: 1, cols: 30, placeholder: "Subject", name: "subject", value: engine.getTemplate("subject")},
               {rows: 4, cols: 30, placeholder: "Subject", name: "body", value: engine.getTemplate("body")}],
            function() {
               var recipient = this["recipient"].value;
               var subject = this["subject"].value;
               var body = this["body"].value;
               if (!engine.getPostKey()) {
                  alert("Getting post key. Please try again");
               } else if (recipient && subject) {
                  engine.setMailTemplate(recipient, subject, body);
                  var recipients = recipient.split(/\s*[,;]+\s*/);
                  for (var id in engine.index) {
//                     if (engine.getCount(id) > 0 && (engine.getPrice(id) || confirm("No COD for " + engine.getName(id)))) {
                     if (engine.getCount(id) > 0) {
                        for (var j = 0; j < recipients.length; j++) {
                           engine.moogle(recipients[j], id, engine.getClass(id), engine.getCount(id), engine.getCount(id) * engine.getPriceNumber(id),
                                   engine.getFormattedText(id, subject), engine.getFormattedText(id, body));
                           engine.setText(id, "Sending to " + recipients[j] + " " + engine.getName(id));
                           if (engine.getClass(id) === "equip") {
                              engine.getElem(id).querySelector(".equip_select").click();
                           }

                        }
                     }
                  }
               }
            }, undefined);
         },
         "Bazzar": function() {
            createModalDialog("Bazaar all selected? IT CAN'T BE REVERSED", [], function() {
               for (var id in engine.index) {
                  if (engine.getClass(id) === "equip" && engine.getCount(id) > 0 &&
                          ((engine.get(id, "tier") === 0 && engine.get(id, "pxp") < 350 && !engine.getPrice(id)) ||
                                  confirm(engine.getName(id) + " is VALUABLE. Proceed? tier" + engine.get(id, "tier") + " pxp" + engine.get(id, "pxp") + " " + engine.getPrice(id)))) {
                     engine.bazaar(id, engine.getCount(id));
                     engine.setText(id, "Bazzaaring " + engine.getName(id));
                     engine.getElem(id).querySelector(".equip_select").click();
                  }
               }
            }, undefined);
         },
         "Salvage": function() {
            createModalDialog("Salvage all selected? IT CAN'T BE REVERSED", [], function() {
               for (var id in engine.index) {
                  if (engine.getClass(id) === "equip" && engine.getCount(id) > 0 &&
                          ((engine.get(id, "tier") === 0 && engine.get(id, "pxp") < 350 && !engine.getPrice(id)) ||
                                  confirm(engine.getName(id) + " is VALUABLE. Proceed? tier" + engine.get(id, "tier") + " pxp" + engine.get(id, "pxp") + " " + engine.getPrice(id)))) {
                     engine.salvage(id);
                     engine.setText(id, "Salvaging");
                     engine.getElem(id).querySelector(".equip_select").click();
                  }
               }
            }, undefined);
         },
         "Repair": function() {
            createModalDialog("Repair all selected?", [], function() {
               for (var id in engine.index) {
                  if (engine.getClass(id) === "equip" && engine.getCount(id) > 0) {
                     engine.repair(id);
                     engine.setText(id, "Repair " + engine.getName(id));
                  }
               }
            }, undefined);
         },
         "Reforge": function() {
            createModalDialog("Reforge all selected? IT CANT BE REVERSED", [], function() {
               for (var id in engine.index) {
                  if (engine.getClass(id) === "equip" && engine.getCount(id) > 0) {
                     engine.reforge(id);
                     engine.setText(id, "Reforge " + engine.getName(id));
                  }
               }
            }, undefined);
         },
         "IW": function() {
            createModalDialog("Item world selected items?", [], function() {
               for (var id in engine.index) {
                  if (engine.getClass(id) === "equip" && engine.getCount(id) > 0) {
                     engine.iw(id);
                     engine.setText(id, "IW " + engine.getName(id));
                     break;
                  }
               }
            }, undefined);
         },
         "Lock": function() {
            for (var id in engine.index) {
               if (engine.getClass(id) === "equip" && engine.getCount(id) > 0) {
                  engine.lockToggle(id, true);
                  var elem = engine.getElem(id).querySelector(".il,.ilp,.iu,.iup");
                  elem.className = elem.className.replace(/[ul]/, "l");

               }
            }
         },
         "Unlock": function() {
            for (var id in engine.index) {
               if (engine.getClass(id) === "equip" && engine.getCount(id) > 0) {
                  engine.lockToggle(id, false);
                  var elem = engine.getElem(id).querySelector(".il,.ilp,.iu,.iup");
                  elem.className = elem.className.replace(/[ul]/, "u");

               }
            }
         },
         "Shrine": function() {
            createModalDialog("Shrine all selected (Type a number for Reward 1=1H 2=2H 3=Staff 4=Shield 5=Cloth 6=Light 7=Heavy)",
                    [{rows: 1, cols: 30, placeholder: "Select a reward type", name: "reward", value: 0}],
            function() {
               for (var i = 0; i < engine.items.length; i++) {
                  var id = engine.getId(engine.items[i]);
                  if (engine.getCount(id) > 0) {
                     engine.setText(id, "Shrine " + engine.getName(id));
                     for (var j = 0; j < engine.getCount(id); j++) {
                        engine.shrine(id, this["reward"].value);
                     }
                  }
               }
            });
         },
         "List": function() {
            createModalDialog("Export to a list (Supported tag: " + TAGS.join(", ") + ")",
                    [{rows: 3, cols: 30, placeholder: "Template", name: "template", value: engine.getListTemplate()}],
            function() {
               var template = this["template"].value;
               engine.setListTemplate(template);
               var nDocument = window.open("", "List").document;
               nDocument.body.innerHTML = "";
               engine.infoCounter = 0;
               for (var i = 0; i < engine.items.length; i++) {
                  var id = engine.getId(engine.items[i]);
                  if (engine.getCount(id) > 0) {
                     var text = engine.getFormattedText(id, template).replace(/\n/gi, "<br>");
                     nDocument.body.appendChild(document.createElement("div")).innerHTML = text;
                     console.log(id, text);
                  }
               }
               for (var i = 0; i < engine.equips.length; i++) {
                  var id = engine.getId(engine.equips[i]);
                  if (engine.getCount(id) > 0) {
                     var text = engine.getFormattedText(id, template).replace(/\n/gi, "<br>");
                     nDocument.body.appendChild(document.createElement("div")).innerHTML = text;
                     console.log(id, text);
                  }
               }
            }, undefined);
         }
      };
      for (var name in buttonList) {
         var button = document.createElement("button");
         button.name = name;
         button.innerHTML = name;
         button.type = "button";
         button.onclick = buttonList[name];

         toolbox.appendChild(button);
      }

   }

   function createModalDialog(message, inputFormat, okayCallback, cancelCallback) {

      var modal = toolbox.querySelector(".item_modal") || toolbox.appendChild(document.createElement("form"));
      modal.className = "item_modal";
      modal.innerHTML = "";
      modal.appendChild(document.createElement("div")).textContent = message;
      for (var i = 0; i < inputFormat.length; i++) {
         var textarea = modal.appendChild(document.createElement("textarea"));
         for (var attrib in inputFormat[i]) {
            textarea[attrib] = inputFormat[i][attrib];
         }

         textarea.addEventListener("keyup", function(e) {
            e.stopPropagation();
         }, true);

         textarea.addEventListener("keydown", function(e) {
            e.stopPropagation();
         }, true);

         textarea.addEventListener("keypress", function(e) {
            e.stopPropagation();
         }, true);
      }

      var okayButton = modal.appendChild(document.createElement("button"));
      okayButton.id = "item_ok";
      okayButton.innerHTML = "OK";
      okayButton.type = "button";
      okayButton.onclick = function() {
         if (okayCallback)
            okayCallback.call(this.form);
         engine.sync();
         modal.classList.add("hidden");
         modal.innerHTML = "";
      };

      var cancelButton = modal.appendChild(document.createElement("button"));
      cancelButton.id = "item_cancel";
      cancelButton.innerHTML = "Cancel";
      cancelButton.type = "button";
      cancelButton.onclick = function() {
         if (cancelCallback) {
            cancelCallback.call(this.form);
         }
         modal.classList.add("hidden");
         modal.innerHTML = "";
      };

      modal.querySelector("button").focus();
   }

   var engine = new Engine();
   var toolbox = createToolbox();
   createFilterField();
   createButtons();
   createEquipsInputs();
   createItemsInputs();
}

HVItemHelper();