define([
	"dojo/_base/array",
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/aspect",
	"dojo/Deferred",
	"dojo/dom-class",
	"dojo/dom-geometry",
	"dojo/dom-style",
	"dojo/i18n",
	"dojo/keys",
	"dojo/on",
	"dojo/query",
	"dojo/window",
	"dojox/html/metrics",
	"dijit/registry",
	"dijit/_WidgetBase",
	"dijit/_Contained",
	"dijit/_Container",
	"dijit/_TemplatedMixin",
	"dijit/_WidgetsInTemplateMixin",
	"dijit/form/Button",
	"dijit/layout/_LayoutWidget",
	"dijit/layout/ContentPane",
	"dijit/Menu",
	"dijit/MenuItem",
	"dojo/text!./RollingList/RollingList.html",
	"dijit/focus",
	"dijit/_base/focus",
	"dojo/i18n!dijit/nls/common"
], function(
	arrayUtil,
	declare,
	lang,
	aspect,
	Deferred,
	domClass,
	domGeometry,
	domStyle,
	i18n,
	keys,
	on,
	query,
	winUtils,
	metrics,
	registry,
	_WidgetBase,
	_Contained,
	_Container,
	_TemplatedMixin,
	_WidgetsInTemplateMixin,
	Button,
	_LayoutWidget,
	ContentPane,
	Menu,
	MenuItem,
	templateRollingList,
	focus,
	baseFocus
){
	var global = this;
	var _RollingListPane = declare("dojox.widget._RollingListPane",
		[ContentPane, _TemplatedMixin, _WidgetsInTemplateMixin, _LayoutWidget], {
		// summary:
		//		a core pane that can be attached to a RollingList.  All panes
		//		should extend this one

		// templateString: string
		//		our template
		templateString: '<div class="dojoxRollingListPane"><table><tbody><tr><td data-dojo-attach-point="containerNode"></td></tr></tbody></div>',

		// parentWidget: dojox/widget/RollingList
		//		Our rolling list widget
		parentWidget: null,

		// parentPane: dojox/widget/_RollingListPane
		//		The pane that immediately precedes ours
		parentPane: null,

		// store: store
		//		the store we must use
		store: null,

		// items: item[]
		//		an array of (possibly not-yet-loaded) items to display in this.
		//		If this array is null, then the query and query options are used to
		//		get the top-level items to use.  This array is also used to watch and
		//		see if the pane needs to be reloaded (store notifications are handled)
		//		by the pane
		items: null,

		// query: object
		//		a query to pass to the datastore.  This is only used if items are null
		query: null,

		// queryOptions: object
		//		query options to be passed to the datastore
		queryOptions: null,

		// focusByNode: boolean
		//		set to false if the subclass will handle its own node focusing
		_focusByNode: true,

		// minWidth: integer
		//		the width (in px) for this pane
		minWidth: 0,

		_setContentAndScroll: function(/*String|DomNode|Nodelist*/cont, /*Boolean?*/isFakeContent){
			// summary:
			//		sets the value of the content and scrolls it into view
			this._setContent(cont, isFakeContent);
			this.parentWidget.scrollIntoView(this);
		},

		_updateNodeWidth: function(n, min){
			// summary:
			//		updates the min width of the pane to be minPaneWidth
			n.style.width = "";
			var nWidth = domGeometry.getMarginBox(n).w;
			if(nWidth < min){
				domGeometry.setMarginBox(n, {w: min});
			}
		},

		_onMinWidthChange: function(v){
			// Called when the min width of a pane has changed
			this._updateNodeWidth(this.domNode, v);
		},

		_setMinWidthAttr: function(v){
			if(v !== this.minWidth){
				this.minWidth = v;
				this._onMinWidthChange(v);
			}
		},

		startup: function(){
			if(this._started){ return; }
			if(this.store && this.store.getFeatures()["dojo.data.api.Notification"]){
				setTimeout(lang.hitch(this, function(){
					// Set connections after a slight timeout to avoid getting in the
					// condition where we are setting them while events are still
					// being fired
					aspect.after(this.store, "onSet", lang.hitch(this, "_onSetItem"));
					aspect.after(this.store, "onNew", lang.hitch(this, "_onNewItem"));
					aspect.after(this.store, "onDelete", lang.hitch(this, "_onDeleteItem"));
				}), 1);
			}
			on(this.focusNode||this.domNode, "onkeypress", lang.hitch(this, "_focusKey"));
			this.parentWidget._updateClass(this.domNode, "Pane");
			this.inherited(arguments);
			this._onMinWidthChange(this.minWidth);
		},

		_focusKey: function(/*Event*/e){
			// summary:
			//		called when a keypress happens on the widget
			if(e.charOrCode == keys.BACKSPACE){
				e.preventDefault();
				e.stopPropagation();
				return;
			}else if(e.charOrCode == keys.LEFT_ARROW && this.parentPane){
				this.parentPane.focus();
				this.parentWidget.scrollIntoView(this.parentPane);
			}else if(e.charOrCode == keys.ENTER){
				this.parentWidget._onExecute();
			}
		},

		focus: function(/*boolean*/force){
			// summary:
			//		sets the focus to this current widget
			if(this.parentWidget._focusedPane != this){
				this.parentWidget._focusedPane = this;
				this.parentWidget.scrollIntoView(this);
				if(this._focusByNode && (!this.parentWidget._savedFocus || force)){
					try{(this.focusNode||this.domNode).focus();}catch(e){}
				}
			}
		},

		_onShow: function(){
			// summary:
			//		checks that the store is loaded
			this.inherited(arguments);
			if((this.store || this.items) && ((this.refreshOnShow && this.domNode) || (!this.isLoaded && this.domNode))){
				this.refresh();
			}
		},

		_load: function(){
			// summary:
			//		sets the "loading" message and then kicks off a query asyncronously
			this.isLoaded = false;
			if(this.items){
				this._setContentAndScroll(this.onLoadStart(), true);
				setTimeout(lang.hitch(this, "_doQuery"), 1);
			}else{
				this._doQuery();
			}
		},

		_doLoadItems: function(/*item[]*/items, /*function*/callback){
			// summary:
			//		loads the given items, and then calls the callback when they
			//		are finished.
			var _waitCount = 0, store = this.store;
			arrayUtil.forEach(items, function(item){
				if(!store.isItemLoaded(item)){ _waitCount++; }
			});
			if(_waitCount === 0){
				callback();
			}else{
				var onItem = function(item){
					_waitCount--;
					if((_waitCount) === 0){
						callback();
					}
				};
				arrayUtil.forEach(items, function(item){
					if(!store.isItemLoaded(item)){
						store.loadItem({item: item, onItem: onItem});
					}
				});
			}
		},

		_doQuery: function(){
			// summary:
			//		either runs the query or loads potentially not-yet-loaded items.
			if(!this.domNode){return;}
			var preload = this.parentWidget.preloadItems;
			preload = (preload === true || (this.items && this.items.length <= Number(preload)));
			if(this.items && preload){
				console.log("a");
				this._doLoadItems(this.items, lang.hitch(this, "onItems"));
			}else if(this.items){
				console.log("b");
				this.onItems();
			}else{
				this._setContentAndScroll(this.onFetchStart(), true);
				this.store.fetch({query: this.query,
					onComplete: function(items){
						console.log(items);
						this.items = items;
						this.onItems();
					},
					onError: function(e){
						console.log(e);
						this._onError("Fetch", e);
					},
					scope: this});
			}
		},

		_hasItem: function(/* item */ item){
			// summary:
			//		returns whether or not the given item is handled by this
			//		pane
			var items = this.items || [];
			for(var i = 0, myItem; (myItem = items[i]); i++){
				if(this.parentWidget._itemsMatch(myItem, item)){
					return true;
				}
			}
			return false;
		},

		_onSetItem: function(/* item */ item,
						/* attribute-name-string */ attribute,
						/* Object|Array */ oldValue,
						/* Object|Array */ newValue){
			// summary:
			//		called when an item in the store has changed
			if(this._hasItem(item)){
				this.refresh();
			}
		},

		_onNewItem: function(/* item */ newItem, /*object?*/ parentInfo){
			// summary:
			//		called when an item is added to the store
			var sel;
			if((!parentInfo && !this.parentPane) ||
				(parentInfo && this.parentPane && this.parentPane._hasItem(parentInfo.item) &&
				(sel = this.parentPane._getSelected()) && this.parentWidget._itemsMatch(sel.item, parentInfo.item))){
				this.items.push(newItem);
				this.refresh();
			}else if(parentInfo && this.parentPane && this._hasItem(parentInfo.item)){
				this.refresh();
			}
		},

		_onDeleteItem: function(/* item */ deletedItem){
			// summary:
			//		called when an item is removed from the store
			if(this._hasItem(deletedItem)){
				this.items = arrayUtil.filter(this.items, function(i){
					return (i != deletedItem);
				});
				this.refresh();
			}
		},

		onFetchStart: function(){
			// summary:
			//		called before a fetch starts
			return this.loadingMessage;
		},

		onFetchError: function(/*Error*/ error){
			// summary:
			//		called when a fetch error occurs.
			return this.errorMessage;
		},

		onLoadStart: function(){
			// summary:
			//		called before a load starts
			return this.loadingMessage;
		},

		onLoadError: function(/*Error*/ error){
			// summary:
			//		called when a load error occurs.
			return this.errorMessage;
		},

		onItems: function(){
			// summary:
			//		called after a fetch or load - at this point, this.items should be
			//  	set and loaded.  Override this function to "do your stuff"
			if(!this.onLoadDeferred){
				this.cancel();
				this.onLoadDeferred = new Deferred(lang.hitch(this, "cancel"));
			}
			this._onLoadHandler();
		}

	});

	var _RollingListGroupPane = declare("dojox.widget._RollingListGroupPane",
		[_RollingListPane], {
		// summary:
		//		a pane that will handle groups (treats them as menu items)

		// templateString: string
		//		our template
		templateString: '<div><div data-dojo-attach-point="containerNode"></div>' +
						'<div data-dojo-attach-point="menuContainer">' +
							'<div data-dojo-attach-point="menuNode"></div>' +
						'</div></div>',

		// _menu: Menu
		//		The menu that we will call addChild() on for adding items
		_menu: null,

		_setContent: function(/*String|DomNode|Nodelist*/cont){
			if(!this._menu){
				// Only set the content if we don't already have a menu
				this.inherited(arguments);
			}
		},

		_onMinWidthChange: function(v){
			// override and resize the menu instead
			if(!this._menu){ return; }
			var dWidth = domGeometry.getMarginBox(this.domNode).w;
			var mWidth = domGeometry.getMarginBox(this._menu.domNode).w;
			this._updateNodeWidth(this._menu.domNode, v - (dWidth - mWidth));
		},

		onItems: function(){
			// summary:
			//		called after a fetch or load
			var selectItem, hadChildren = false;
			if(this._menu){
				selectItem = this._getSelected();
				this._menu.destroyRecursive();
			}
			this._menu = this._getMenu();
			var child, selectMenuItem;
			if(this.items.length){
				arrayUtil.forEach(this.items, function(item){
					child = this.parentWidget._getMenuItemForItem(item, this);
					if(child){
						if(selectItem && this.parentWidget._itemsMatch(child.item, selectItem.item)){
							selectMenuItem = child;
						}
						this._menu.addChild(child);
					}
				}, this);
			}else{
				child = this.parentWidget._getMenuItemForItem(null, this);
				if(child){
					this._menu.addChild(child);
				}
			}
			if(selectMenuItem){
				this._setSelected(selectMenuItem);
				if((selectItem && !selectItem.children && selectMenuItem.children) ||
					(selectItem && selectItem.children && !selectMenuItem.children)){
					var itemPane = this.parentWidget._getPaneForItem(selectMenuItem.item, this, selectMenuItem.children);
					if(itemPane){
						this.parentWidget.addChild(itemPane, this.getIndexInParent() + 1);
					}else{
						this.parentWidget._removeAfter(this);
						this.parentWidget._onItemClick(null, this, selectMenuItem.item, selectMenuItem.children);
					}
				}
			}else if(selectItem){
				this.parentWidget._removeAfter(this);
			}
			this.containerNode.innerHTML = "";
			this.containerNode.appendChild(this._menu.domNode);
			this.parentWidget.scrollIntoView(this);
			this._checkScrollConnection(true);
			this.inherited(arguments);
			this._onMinWidthChange(this.minWidth);
		},

		_checkScrollConnection: function(doLoad){
			// summary:
			//		checks whether or not we need to connect to our onscroll
			//		function
			var store = this.store;
			if(this._scrollConn){
				this.disconnect(this._scrollConn);
			}
			delete this._scrollConn;
			if(!arrayUtil.every(this.items, function(i){return store.isItemLoaded(i);})){
				if(doLoad){
					this._loadVisibleItems();
				}
				this._scrollConn = on(this.domNode, "onscroll", lang.hitch(this, "_onScrollPane"));
			}
		},

		startup: function(){
			this.inherited(arguments);
			this.parentWidget._updateClass(this.domNode, "GroupPane");
		},

		focus: function(/*boolean*/force){
			// summary:
			//		sets the focus to this current widget
			if(this._menu){
				var focusNode;
				if(this._pendingFocus){
					this.disconnect(this._pendingFocus);
				}
				delete this._pendingFocus;

				// We focus the right widget - either the focusedChild, the
				// selected node, the first menu item, or the menu itself
				var focusWidget = this._menu.focusedChild;
				if(!focusWidget){
					focusNode = query(".dojoxRollingListItemSelected", this.domNode)[0];
					if(focusNode){
						focusWidget = registry.byNode(focusNode);
					}
				}
				if(!focusWidget){
					focusWidget = this._menu.getChildren()[0] || this._menu;
				}
				this._focusByNode = false;
				if(focusWidget.focusNode){
					focusNode = focusWidget.focusNode;
					if(!this.parentWidget._savedFocus || force){
						try{focusNode.focus();}catch(e){}
					}
					setTimeout(function(){
						try{
							winUtils.scrollIntoView(focusNode);
						}catch(e){}
					}, 1);
				}else if(focusWidget.focus){
					if(!this.parentWidget._savedFocus || force){
						focusWidget.focus();
					}
				}else{
					this._focusByNode = true;
				}
				this.inherited(arguments);
			}else if(!this._pendingFocus){
				this._pendingFocus = aspect.after(this, "onItems", lang.hitch(this, "focus"));
			}
		},

		_getMenu: function(){
			// summary:
			//		returns a widget to be used for the container widget.
			var self = this;
			var menu = new Menu({
				parentMenu: this.parentPane ? this.parentPane._menu : null,
				onCancel: function(/*Boolean*/ closeAll){
					if(self.parentPane){
						self.parentPane.focus(true);
					}
				},
				_moveToPopup: function(/*Event*/ evt){
					if(this.focusedChild && !this.focusedChild.disabled){
						this.onItemClick(this.focusedChild, evt);
					}
				}
			}, this.menuNode);
			aspect.after(menu, "onItemClick", function(/*dijit/MenuItem*/ item, /*Event*/ evt){
				if(item.disabled){ return; }
				evt.alreadySelected = domClass.contains(item.domNode, "dojoxRollingListItemSelected");
				if(evt.alreadySelected &&
					((evt.type == "keypress" && evt.charOrCode != keys.ENTER) ||
					(evt.type == "internal"))){
					var p = this.parentWidget.getChildren()[this.getIndexInParent() + 1];
					if(p){
						p.focus(true);
						this.parentWidget.scrollIntoView(p);
					}
				}else{
					this._setSelected(item, menu);
					this.parentWidget._onItemClick(evt, this, item.item, item.children);
					if(evt.type == "keypress" && evt.charOrCode == keys.ENTER){
						this.parentWidget._onExecute();
					}
				}
			});
			if(!menu._started){
				menu.startup();
			}
			return menu;
		},

		_onScrollPane: function(){
			// summary:
			//		called when the pane has been scrolled - it sets a timeout
			//		so that we don't try and load our visible items too often during
			//		a scroll
			if(this._visibleLoadPending){
				window.clearTimeout(this._visibleLoadPending);
			}
			this._visibleLoadPending = setTimeout(lang.hitch(this, "_loadVisibleItems"), 500);
		},

		_loadVisibleItems: function(){
			// summary:
			//		loads the items that are currently visible in the pane
			delete this._visibleLoadPending;
			var menu = this._menu;
			if(!menu){ return; }
			var children = menu.getChildren();
			if(!children || !children.length){ return; }
			var gpbme = function(n, m, pb){
				var s = domStyle.getComputedStyle(n);
				var r = 0;
				if(m){ r += domGeometry.getMarginExtents(n, s).t; }
				if(pb){ r += domGeometry.getPadBorderExtents(n, s).t; }
				return r;
			};
			var topOffset = gpbme(this.domNode, false, true) +
							gpbme(this.containerNode, true, true) +
							gpbme(menu.domNode, true, true) +
							gpbme(children[0].domNode, true, false);
			var h = domGeometry.getContentBox(this.domNode).h;
			var minOffset = this.domNode.scrollTop - topOffset - (h/2);
			var maxOffset = minOffset + (3*h/2);
			var menuItemsToLoad = arrayUtil.filter(children, function(c){
				var cnt = c.domNode.offsetTop;
				var s = c.store;
				var i = c.item;
				return (cnt >= minOffset && cnt <= maxOffset && !s.isItemLoaded(i));
			});
			var itemsToLoad = arrayUtil.map(menuItemsToLoad, function(c){
				return c.item;
			});
			var onItems = lang.hitch(this, function(){
				var selectItem = this._getSelected();
				var selectMenuItem;
				arrayUtil.forEach(itemsToLoad, function(item, idx){
					var newItem = this.parentWidget._getMenuItemForItem(item, this);
					var oItem = menuItemsToLoad[idx];
					var oIdx = oItem.getIndexInParent();
					menu.removeChild(oItem);
					if(newItem){
						if(selectItem && this.parentWidget._itemsMatch(newItem.item, selectItem.item)){
							selectMenuItem = newItem;
						}
						menu.addChild(newItem, oIdx);
						if(menu.focusedChild == oItem){
							menu.focusChild(newItem);
						}
					}
					oItem.destroy();
				}, this);
				this._checkScrollConnection(false);
			});
			this._doLoadItems(itemsToLoad, onItems);
		},

		_getSelected: function(/*Menu?*/ menu){
			// summary:
			//		returns the selected menu item - or null if none are selected
			if(!menu){ menu = this._menu; }
			if(menu){
				var children = this._menu.getChildren();
				for(var i = 0, item; (item = children[i]); i++){
					if(domClass.contains(item.domNode, "dojoxRollingListItemSelected")){
						return item;
					}
				}
			}
			return null;
		},

		_setSelected: function(/*dijit/MenuItem?*/ item, /*dijit/Menu?*/ menu){
			// summary:
			//		selects the given item in the given menu (defaults to pane's menu)
			if(!menu){ menu = this._menu;}
			if(menu){
				arrayUtil.forEach(menu.getChildren(), function(i){
					this.parentWidget._updateClass(i.domNode, "Item", {"Selected": (item && (i == item && !i.disabled))});
				}, this);
			}
		}
	});

	var RollingList = declare("dojox.widget.RollingList",
		[_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, _Container], {
		// summary:
		//		a rolling list that can be tied to a data store with children

		// templateString: String
		//		The template to be used to construct the widget.
		templateString: templateRollingList,

		// className: string
		//		an additional class (or space-separated classes) to add for our widget
		className: "",

		// store: store
		//		the store we must use
		store: null,

		// query: object
		//		a query to pass to the datastore.  This is only used if items are null
		query: null,

		// queryOptions: object
		//		query options to be passed to the datastore
		queryOptions: null,

		// childrenAttrs: String[]
		//		one ore more attributes that holds children of a node
		childrenAttrs: ["children"],

		// parentAttr: string
		//		the attribute to read for finding our parent item (if any)
		parentAttr: "",

		// value: item
		//		The value that has been selected
		value: null,

		// executeOnDblClick: boolean
		//		Set to true if you want to call onExecute when an item is
		//		double-clicked, false if you want to call onExecute yourself. (mainly
		//		used for popups to control how they want to be handled)
		executeOnDblClick: true,

		// preloadItems: boolean or int
		//		if set to true, then onItems will be called only *after* all items have
		//		been loaded (ie store.isLoaded will return true for all of them).  If
		//		false, then no preloading will occur.  If set to an integer, preloading
		//		will occur if the number of items is less than or equal to the value
		//		of the integer.  The onItems function will need to be aware of handling
		//		items that may not be loaded
		preloadItems: false,

		// showButtons: boolean
		//		if set to true, then buttons for "OK" and "Cancel" will be provided
		showButtons: false,

		// okButtonLabel: string
		//		The string to use for the OK button - will use dijit's common "OK" string
		//		if not set
		okButtonLabel: "",

		// cancelButtonLabel: string
		//		The string to use for the Cancel button - will use dijit's common
		//		"Cancel" string if not set
		cancelButtonLabel: "",

		// minPaneWidth: integer
		//		the minimum pane width (in px) for all child panes.  If they are narrower,
		//		the width will be increased to this value.
		minPaneWidth: 0,

		postMixInProperties: function(){
			// summary:
			//		Mix in our labels, if they are not set
			this.inherited(arguments);
			var loc = i18n.getLocalization("dijit", "common");
			this.okButtonLabel = this.okButtonLabel || loc.buttonOk;
			this.cancelButtonLabel = this.cancelButtonLabel || loc.buttonCancel;
		},

		_setShowButtonsAttr: function(doShow){
			// summary:
			//		Sets the visibility of the buttons for the widget
			var needsLayout = false;
			if((this.showButtons != doShow && this._started) ||
				(this.showButtons == doShow && !this.started)){
				needsLayout = true;
			}
			domClass.toggle(this.domNode, "dojoxRollingListButtonsHidden", !doShow);
			this.showButtons = doShow;
			if(needsLayout){
				if(this._started){
					this.layout();
				}else{
					setTimeout(lang.hitch(this, "layout"), 0);
				}
			}
		},

		_itemsMatch: function(/*item*/ item1, /*item*/ item2){
			// summary:
			//		returns whether or not the two items match - checks ID if
			//		they aren't the exact same object
			if(!item1 && !item2){
				return true;
			}else if(!item1 || !item2){
				return false;
			}
			return (item1 == item2 ||
				(this._isIdentity && this.store.getIdentity(item1) == this.store.getIdentity(item2)));
		},

		_removeAfter: function(/*Widget or int*/ idx){
			// summary:
			//		removes all widgets after the given widget (or index)
			if(typeof idx != "number"){
				idx = this.getIndexOfChild(idx);
			}
			if(idx >= 0){
				arrayUtil.forEach(this.getChildren(), function(c, i){
					if(i > idx){
						this.removeChild(c);
						c.destroyRecursive();
					}
				}, this);
			}
			var children = this.getChildren(), child = children[children.length - 1];
			var selItem = null;
			while(child && !selItem){
				var val = child._getSelected ? child._getSelected() : null;
				if(val){
					selItem = val.item;
				}
				child = child.parentPane;
			}
			if(!this._setInProgress){
				this._setValue(selItem);
			}
		},

		addChild: function(/*_WidgetBase*/ widget, /*int?*/ insertIndex){
			// summary:
			//		adds a child to this rolling list - if passed an insertIndex,
			//		then all children from that index on will be removed and destroyed
			//		before adding the child.
			if(insertIndex > 0){
				this._removeAfter(insertIndex - 1);
			}
			this.inherited(arguments);
			if(!widget._started){
				widget.startup();
			}
			widget.set("minWidth", this.minPaneWidth);
			this.layout();
			if(!this._savedFocus){
				widget.focus();
			}
		},

		_setMinPaneWidthAttr: function(value){
			// summary:
			//		Sets the min pane width of all children
			if(value !== this.minPaneWidth){
				this.minPaneWidth = value;
				arrayUtil.forEach(this.getChildren(), function(c){
					c.set("minWidth", value);
				});
			}
		},

		_updateClass: function(/* Node */ node, /* String */ type, /* Object? */ options){
			// summary:
			//		sets the state of the given node with the given type and options
			// options:
			//		an object with key-value-pairs.  The values are boolean, if true,
			//		the key is added as a class, if false, it is removed.
			if(!this._declaredClasses){
				this._declaredClasses = ("dojoxRollingList " + this.className).split(" ");
			}
			arrayUtil.forEach(this._declaredClasses, function(c){
				if(c){
					domClass.add(node, c + type);
					for(var k in options||{}){
						domClass.toggle(node, c + type + k, options[k]);
					}
					domClass.toggle(node, c + type + "FocusSelected",
						(domClass.contains(node, c + type + "Focus") && domClass.contains(node, c + type + "Selected")));
					domClass.toggle(node, c + type + "HoverSelected",
						(domClass.contains(node, c + type + "Hover") && domClass.contains(node, c + type + "Selected")));
				}
			});
		},

		scrollIntoView: function(/*dijit/_WidgetBase*/ childWidget){
			// summary:
			//		scrolls the given widget into view
			if(this._scrollingTimeout){
				clearTimeout(this._scrollingTimeout);
			}
			delete this._scrollingTimeout;
			this._scrollingTimeout = setTimeout(lang.hitch(this, function(){
				if(childWidget.domNode){
					winUtils.scrollIntoView(childWidget.domNode);
				}
				delete this._scrollingTimeout;
				return;
			}), 1);
		},

		resize: function(args){
			_LayoutWidget.prototype.resize.call(this, args);
		},

		layout: function(){
			var children = this.getChildren();
			if(this._contentBox){
				var bn = this.buttonsNode;
				var height = this._contentBox.h - domGeometry.getMarginBox(bn).h - metrics.getScrollbar().h;
				arrayUtil.forEach(children, function(c){
					domGeometry.setMarginBox(c.domNode, {h: height});
				});
			}
			if(this._focusedPane){
				var foc = this._focusedPane;
				delete this._focusedPane;
				if(!this._savedFocus){
					foc.focus();
				}
			}else if(children && children.length){
				if(!this._savedFocus){
					children[0].focus();
				}
			}
		},

		_onChange: function(/*item*/ value){
			this.onChange(value);
		},

		_setValue: function(/* item */ value){
			// summary:
			//		internally sets the value and fires onchange
			delete this._setInProgress;
			if(!this._itemsMatch(this.value, value)){
				this.value = value;
				this._onChange(value);
			}
		},

		_setValueAttr: function(/* item */ value){
			// summary:
			//		sets the value of this widget to the given store item
			if(this._itemsMatch(this.value, value) && !value){ return; }
			if(this._setInProgress && this._setInProgress === value){ return; }
			this._setInProgress = value;
			if(!value || !this.store.isItem(value)){
				var pane = this.getChildren()[0];
				pane._setSelected(null);
				this._onItemClick(null, pane, null, null);
				return;
			}

			var fetchParentItems = lang.hitch(this, function(/*item*/ item, /*function*/callback){
				// summary:
				//		Fetches the parent items for the given item
				var store = this.store, id;
				if(this.parentAttr && store.getFeatures()["dojo.data.api.Identity"] &&
					((id = this.store.getValue(item, this.parentAttr)) || id === "")){
					// Fetch by parent attribute
					var cb = function(i){
						if(store.getIdentity(i) == store.getIdentity(item)){
							callback(null);
						}else{
							callback([i]);
						}
					};
					if(id === ""){
						callback(null);
					}else if(typeof id == "string"){
						store.fetchItemByIdentity({identity: id, onItem: cb});
					}else if(store.isItem(id)){
						cb(id);
					}
				}else{
					// Fetch by finding children
					var numCheck = this.childrenAttrs.length;
					var parents = [];
					arrayUtil.forEach(this.childrenAttrs, function(attr){
						var q = {};
						q[attr] = item;
						store.fetch({query: q, scope: this,
							onComplete: function(items){
								if(this._setInProgress !== value){
									return;
								}
								parents = parents.concat(items);
								numCheck--;
								if(numCheck === 0){
									callback(parents);
								}
							}
						});
					}, this);
				}
			});

			var setFromChain = lang.hitch(this, function(/*item[]*/itemChain, /*integer*/idx){
				// summary:
				//		Sets the value of the widget at the given index in the chain - onchanges are not
				//		fired here
				var set = itemChain[idx];
				var child = this.getChildren()[idx];
				var conn;
				if(set && child){
					var fx = lang.hitch(this, function(){
						if(conn){
							conn.remove();
						}
						if(this._setInProgress !== value){
							return;
						}
						var selOpt = arrayUtil.filter(child._menu.getChildren(), function(i){
							return this._itemsMatch(i.item, set);
						}, this)[0];
						if(selOpt){
							idx++;
							child._menu.onItemClick(selOpt, {type: "internal",
														stopPropagation: function(){},
														preventDefault: function(){}});
							if(itemChain[idx]){
								setFromChain(itemChain, idx);
							}else{
								this._setValue(set);
								this.onItemClick(set, child, this.getChildItems(set));
							}
						}
					});
					if(!child.isLoaded){
						conn = aspect.after(child, "onLoad", fx);
					}else{
						fx();
					}
				}else if(idx === 0){
					this.set("value", null);
				}
			});

			var parentChain = [];
			var onParents = lang.hitch(this, function(/*item[]*/ parents){
				// summary:
				//		recursively grabs the parents - only the first one is followed
				if(parents && parents.length){
					parentChain.push(parents[0]);
					fetchParentItems(parents[0], onParents);
				}else{
					if(!parents){
						parentChain.pop();
					}
					parentChain.reverse();
					setFromChain(parentChain, 0);
				}
			});

			// Only set the value in display if we are shown - if we are in a dropdown,
			// and are hidden, don't actually do the scrolling in the display (it can
			// mess up layouts)
			var ns = this.domNode.style;
			if(ns.display == "none" || ns.visibility == "hidden"){
				this._setValue(value);
			}else if(!this._itemsMatch(value, this._visibleItem)){
				onParents([value]);
			}
		},

		_onItemClick: function(/* Event */ evt, /* dijit/_Contained */ pane, /* item */ item, /* item[]? */ children){
			// summary:
			//		internally called when a widget should pop up its child

			if(evt){
				var itemPane = this._getPaneForItem(item, pane, children);
				var alreadySelected = (evt.type == "click" && evt.alreadySelected);

				if(alreadySelected && itemPane){
					this._removeAfter(pane.getIndexInParent() + 1);
					var next = pane.getNextSibling();
					if(next && next._setSelected){
						next._setSelected(null);
					}
					this.scrollIntoView(next);
				}else if(itemPane){
					this.addChild(itemPane, pane.getIndexInParent() + 1);
					if(this._savedFocus){
						itemPane.focus(true);
					}
				}else{
					this._removeAfter(pane);
					this.scrollIntoView(pane);
				}
			}else if(pane){
				this._removeAfter(pane);
				this.scrollIntoView(pane);
			}
			if(!evt || evt.type != "internal"){
				this._setValue(item);
				this.onItemClick(item, pane, children);
			}
			this._visibleItem = item;
		},

		_getPaneForItem: function(/* item? */ item, /* dijit/_Contained? */ parentPane, /* item[]? */ children){
			// summary:
			//		gets the pane for the given item, and mixes in our needed parts
			//		Returns the pane for the given item (null if the root pane) - after mixing in
			//		its stuff.
			var ret = this.getPaneForItem(item, parentPane, children);
			ret.store = this.store;
			ret.parentWidget = this;
			ret.parentPane = parentPane||null;
			if(!item){
				ret.query = this.query;
				ret.queryOptions = this.queryOptions;
			}else if(children){
				ret.items = children;
			}else{
				ret.items = [item];
			}
			return ret;
		},

		_getMenuItemForItem: function(/*item*/ item, /* dijit/_Contained */ parentPane){
			// summary:
			//		returns a widget for the given store item.  The returned
			//		item will be added to this widget's container widget.  null will
			//		be passed in for an "empty" item.
			var store = this.store;
			if(!item || !store || !store.isItem(item)){
				var i = new MenuItem({
					label: "---",
					disabled: true,
					iconClass: "dojoxEmpty",
					focus: function(){
						// Do nothing on focus of this guy...
					}
				});
				this._updateClass(i.domNode, "Item");
				return i;
			}else{
				var itemLoaded = store.isItemLoaded(item);
				var childItems = itemLoaded ? this.getChildItems(item) : undefined;
				var widgetItem;
				if(childItems){
					widgetItem = this.getMenuItemForItem(item, parentPane, childItems);
					widgetItem.children = childItems;
					this._updateClass(widgetItem.domNode, "Item", {"Expanding": true});
					if(!widgetItem._started){
						var c = widgetItem.on(widgetItem, "startup", function(){
							c.remove();
							domStyle.set(this.arrowWrapper, "visibility", "");
						});
					}else{
						domStyle.set(widgetItem.arrowWrapper, "visibility", "");
					}
				}else{
					widgetItem = this.getMenuItemForItem(item, parentPane, null);
					if(itemLoaded){
						this._updateClass(widgetItem.domNode, "Item", {"Single": true});
					}else{
						this._updateClass(widgetItem.domNode, "Item", {"Unloaded": true});
						widgetItem.set("disabled", true);
					}
				}
				widgetItem.store = this.store;
				widgetItem.item = item;
				if(!widgetItem.label){
					widgetItem.set("label", this.store.getLabel(item).replace(/</,"&lt;"));
				}
				if(widgetItem.focusNode){
					widgetItem.focus = function(){
						// Don't set our class
						if(!this.disabled){try{this.focusNode.focus();}catch(e){}}
					};
					on(widgetItem.focusNode, "mouseenter", lang.hitch(this, function(){
						if(!this.disabled){
							this._updateClass(this.domNode, "Item", {"Hover": true});
						}
					}));
					on(widgetItem.focusNode, "mouseleave", lang.hitch(this, function(){
						if(!this.disabled){
							this._updateClass(this.domNode, "Item", {"Hover": false});
						}
					}));
					on(widgetItem.focusNode, "blur", lang.hitch(this, function(){
						this._updateClass(this.domNode, "Item", {"Focus": false, "Hover": false});
					}));
					on(widgetItem.focusNode, "focus", lang.hitch(this, function(){
						this._updateClass(this.domNode, "Item", {"Focus": true});
						this._focusedPane = parentPane;
					}));
					if(this.executeOnDblClick){
						on(widgetItem.focusNode, "ondblclick", lang.hitch(this, function(){
							this._onExecute();
						}));
					}
				}
				return widgetItem;
			}
		},

		_setStore: function(/* dojo/data/api/Read */ store){
			// summary:
			//		sets the store for this widget */
			if(store === this.store && this._started){ return; }
			this.store = store;
			this._isIdentity = store.getFeatures()["dojo.data.api.Identity"];
			var rootPane = this._getPaneForItem();
			this.addChild(rootPane, 0);
		},

		_onKey: function(/*Event*/ e){
			// summary:
			//		called when a keypress event happens on this widget
			if(e.charOrCode == keys.BACKSPACE){
				e.preventDefault();
				e.stopPropagation();
				return;
			}else if(e.charOrCode == keys.ESCAPE && this._savedFocus){
				try{focus(this._savedFocus);}catch(e){}
				e.preventDefault();
				e.stopPropagation();
				return;
			}else if(e.charOrCode == keys.LEFT_ARROW ||
				e.charOrCode == keys.RIGHT_ARROW){
				e.preventDefault();
				e.stopPropagation();
				return;
			}
		},

		_resetValue: function(){
			// summary:
			//		function called when the value is reset.
			this.set("value", this._lastExecutedValue);
		},

		_onCancel: function(){
			// summary:
			//		function called when the cancel button is clicked.  It
			//		resets its value to whatever was last executed and then cancels
			this._resetValue();
			this.onCancel();
		},

		_onExecute: function(){
			// summary:
			//		function called when the OK button is clicked or when an
			//		item is selected (double-clicked or "enter" pressed on it)
			this._lastExecutedValue = this.get("value");
			this.onExecute();
		},

		focus: function(){
			// summary:
			//		sets the focus state of this widget
			var wasSaved = this._savedFocus;
			this._savedFocus = baseFocus.getFocus(this);
			if(!this._savedFocus.node){
				delete this._savedFocus;
			}
			if(!this._focusedPane){
				var child = this.getChildren()[0];
				if(child && !wasSaved){
					child.focus(true);
				}
			}else{
				this._savedFocus = baseFocus.getFocus(this);
				var foc = this._focusedPane;
				delete this._focusedPane;
				if(!wasSaved){
					foc.focus(true);
				}
			}
		},

		handleKey:function(/*Event*/e){
			// summary:
			//		handle the key for the given event - called by dropdown
			//		widgets
			if(e.keyCode == keys.DOWN_ARROW){
				delete this._savedFocus;
				this.focus();
				return false;
			}else if(e.keyCode == keys.ESCAPE){
				this._onCancel();
				return false;
			}
			return true;
		},

		_updateChildClasses: function(){
			// summary:
			//		Called when a child is added or removed - so that we can
			//		update the classes for styling the "current" one differently than
			//		the others
			var children = this.getChildren();
			var length = children.length;
			arrayUtil.forEach(children, function(c, idx){
				domClass.toggle(c.domNode, "dojoxRollingListPaneCurrentChild", (idx == (length - 1)));
				domClass.toggle(c.domNode, "dojoxRollingListPaneCurrentSelected", (idx == (length - 2)));
			});
		},

		startup: function(){
			if(this._started){ return; }
			if(!this.getParent || !this.getParent()){
				this.resize();
				on(global, "resize", lang.hitch(this, "resize"));
			}
			aspect.after(this, "addChild", lang.hitch(this, "_updateChildClasses"));
			aspect.after(this, "removeChild", lang.hitch(this, "_updateChildClasses"));
			this._setStore(this.store);
			this.set("showButtons", this.showButtons);
			this.inherited(arguments);
			this._lastExecutedValue = this.get("value");
		},

		getChildItems: function(/*item*/ item){
			// summary:
			//		Returns the child items for the given store item
			var childItems, store = this.store;
			arrayUtil.forEach(this.childrenAttrs, function(attr){
				var vals = store.getValues(item, attr);
				if(vals && vals.length){
					childItems = (childItems||[]).concat(vals);
				}
			});
			return childItems;
		},

		getMenuItemForItem: function(/*item*/ item, /* dijit/_Contained */ parentPane, /* item[]? */ children){
			// summary:
			//		user overridable function to return a widget for the given item
			//		and its children.
			return new MenuItem({});
		},

		getPaneForItem: function(/* item? */ item, /* dijit/_Contained? */ parentPane, /* item[]? */ children){
			// summary:
			//		user-overridable function to return a pane that corresponds
			//		to the given item in the store.  It can return null to not add a new pane
			//		(ie, you are planning on doing something else with it in onItemClick)

			// Item is undefined for the root pane, children is undefined for non-group panes
			if(!item || children){
				return new _RollingListGroupPane({});
			}else{
				return null;
			}
		},

		onItemClick: function(/* item */ item, /* dijit/_Contained */ pane, /* item[]? */ children){
			// summary:
			//		called when an item is clicked - it receives the store item
		},

		onExecute: function(){
			// summary:
			//		exists so that popups don't disappear too soon
		},

		onCancel: function(){
			// summary:
			//		exists so that we can close ourselves if we wish
		},

		onChange: function(/* item */ value){
			// summary:
			//		called when the value of this widget has changed
		}

	});
	return RollingList;
});
