define([
	"dojo/_base/array",
	"dojo/_base/declare",
	"dojo/_base/fx",
	"dojo/_base/lang",
	"dojo/dom",
	"dojo/dom-attr",
	"dojo/dom-class",
	"dojo/dom-construct",
	"dojo/dom-geometry",
	"dojo/dom-style",
	"dojo/on",
	"dojo/query",
	"dojo/string",
	"dojo/text!./resources/SlideShow.html",
	"dojo/topic",
	"dijit/registry",
	"dijit/_WidgetBase",
	"dijit/_TemplatedMixin",
	"dojo/NodeList-dom"
], function(
	arrayUtil,
	declare,
	fx,
	lang,
	dom,
	domAttr,
	domClass,
	domConstruct,
	domGeometry,
	domStyle,
	on,
	query,
	string,
	template,
	topic,
	registry,
	_WidgetBase,
	_TemplatedMixin
){

	//
	// dojox/image/SlideShow courtesy Shane O Sullivan, licensed under a Dojo CLA
	// For a sample usage, see http://www.skynet.ie/~sos/photos.php
	//
	//
	//	TODO: more cleanups
	//

	return declare("dojox.image.SlideShow",
		[_WidgetBase, _TemplatedMixin],
		{
		// summary:
		//		A Slideshow Widget

		// imageHeight: Number
		//		The maximum height of an image
		imageHeight: 375,

		// imageWidth: Number
		//		The maximum width of an image.
		imageWidth: 500,

		// title: String
		//		The initial title of the SlideShow
		title: "",

		// titleTemplate: String
		//	a way to customize the wording in the title. supported parameters to be populated are:
		//		${title} = the passed title of the image
		//		${current} = the current index of the image
		//		${total} = the total number of images in the SlideShow
		//
		//	should add more?
		titleTemplate: '${title} <span class="slideShowCounterText">(${current} of ${total})</span>',

		// noLink: Boolean
		//	Prevents the slideshow from putting an anchor link around the displayed image
		//	enables if true, though still will not link in absence of a url to link to
		noLink: false,

		// loop: Boolean
		//	true/false - make the slideshow loop
		loop: true,

		// hasNav: Boolean
		//	toggle to enable/disable the visual navigation controls
		hasNav: true,

		// images: Array
		//	Contains the DOM nodes that individual images are stored in when loaded or loading.
		images: [],

		// pageSize: Number
		//	The number of images to request each time.
		pageSize: 20,

		// autoLoad: Boolean
		//	If true, then images are preloaded, before the user navigates to view them.
		//	If false, an image is not loaded until the user views it.
		autoLoad: true,

		// autoStart: Boolean
		//	If true, the SlideShow begins playing immediately
		autoStart: false,

		// fixedHeight: Boolean
		//	If true, the widget does not resize itself to fix the displayed image.
		fixedHeight: false,

		// imageStore: Object
		//	Implementation of the dojo/data/api/Read API, which provides data on the images
		//	to be displayed.
		imageStore: null,

		// linkAttr: String
		//	Defines the name of the attribute to request from the store to retrieve the
		//	URL to link to from an image, if any.
		linkAttr: "link",

		// imageLargeAttr: String
		//	Defines the name of the attribute to request from the store to retrieve the
		//	URL to the image.
		imageLargeAttr: "imageUrl",

		// titleAttr: String
		//	Defines the name of the attribute to request from the store to retrieve the
		//	title of the picture, if any.
		titleAttr: "title",

		// slideshowInterval: Number
		//	Time, in seconds, between image transitions during a slideshow.
		slideshowInterval: 3,

		templateString: template,

		// _imageCounter: Number
		//	A counter to keep track of which index image is to be loaded next
		_imageCounter: 0,

		// _tmpImage: DomNode
		//	The temporary image to show when a picture is loading.
		_tmpImage: null,

		// _request: Object
		//	Implementation of the dojo/data/api/Request API, which defines the query
		//	parameters for accessing the store.
		_request: null,

		postCreate: function(){
			// summary:
			//		Initializes the widget, sets up listeners and shows the first image
			this.inherited(arguments);
			var img = domConstruct.create("img");

			// FIXME: should API be to normalize an image to fit in the specified height/width?
			domAttr.set(img, {"width": this.imageWidth, "height": this.imageHeight});

			if(this.hasNav){
				on(this.outerNode, "mouseover", lang.hitch(this, function(evt){
					try{ this._showNav();}
					catch(e){} //TODO: remove try/catch
				}));
				on(this.outerNode, "mouseout", lang.hitch(this, function(evt){
					try{ this._hideNav(evt);}
					catch(e){} //TODO: remove try/catch
				}));
			}

			this.outerNode.style.width = this.imageWidth + "px";

			domAttr.set(img, "src", this._blankGif);

			this.largeNode.appendChild(img);
			this._tmpImage = this._currentImage = img;
			this._fitSize(true);

			this._loadImage(0, lang.hitch(this, "showImage", 0));
			this._calcNavDimensions();
			domStyle.set(this.navNode, "opacity", 0);
		},

		setDataStore: function(dataStore, request, /*optional*/paramNames){
			// summary:
			//		Sets the data store and request objects to read data from.
			// dataStore:
			//		An implementation of the dojo/data/api/Read API. This accesses the image
			//		data.
			// request:
			//		An implementation of the dojo/data/api/Request API. This specifies the
			//		query and paging information to be used by the data store
			// paramNames:
			//		An object defining the names of the item attributes to fetch from the
			//		data store.  The three attributes allowed are 'linkAttr', 'imageLargeAttr' and 'titleAttr'
			this.reset();
			var _this = this;

			this._request = {
				query: {},
				start: request.start || 0,
				count: request.count || this.pageSize,
				onBegin: function(count, request){
					// FIXME: fires too often?!?
					_this.maxPhotos = count;
				}
			};
			if(request.query){
				lang.mixin(this._request.query, request.query);
			}
			if(paramNames){
				arrayUtil.forEach(["imageLargeAttr", "linkAttr", "titleAttr"], function(attrName){
					if(paramNames[attrName]){
						this[attrName] = paramNames[attrName];
					}
				}, this);
			}

			var _complete = function(items){
				// FIXME: onBegin above used to work for maxPhotos:
				_this.maxPhotos = items.length;
				_this._request.onComplete = null;
				if(_this.autoStart){
					_this.imageIndex = -1;
					_this.toggleSlideShow();
				} else {
					_this.showImage(0);
				}

			};

			this.imageStore = dataStore;
			this._request.onComplete = _complete;
			this._request.start = 0;
			this.imageStore.fetch(this._request);
		},

		reset: function(){
			// summary:
			//		Resets the widget to its initial state
			// description:
			//		Removes all previously loaded images, and clears all caches.
			query("> *", this.largeNode).orphan();
			domConstruct.place(this._tmpImage, this.largeNode);

			query("> *", this.hiddenNode).orphan();
			arrayUtil.forEach(this.images, function(img){
				if(img && img.parentNode){ img.parentNode.removeChild(img); }
			});
			this.images = [];
			this.isInitialized = false;
			this._imageCounter = 0;
		},

		isImageLoaded: function(index){
			// summary:
			//		Returns true if image at the specified index is loaded, false otherwise.
			// index:
			//		The number index in the data store to check if it is loaded.
			return this.images && this.images.length > index && this.images[index];
		},

		moveImageLoadingPointer: function(index){
			// summary:
			//		If 'autoload' is true, this tells the widget to start loading
			//		images from the specified pointer.
			// index:
			//		The number index in the data store to start loading images from.
			this._imageCounter = index;
		},

		destroy: function(){
			// summary:
			//		Cleans up the widget when it is being destroyed
			if(this._slideId) { this._stop(); }
			this.inherited(arguments);
		},

		showNextImage: function(inTimer, forceLoop){
			// summary:
			//		Changes the image being displayed to the next image in the data store
			// inTimer: Boolean
			//		If true, a slideshow is active, otherwise the slideshow is inactive.
			if(inTimer && this._timerCancelled){ return false; }

			if(this.imageIndex + 1 >= this.maxPhotos){
				if(inTimer && (this.loop || forceLoop)){
					this.imageIndex = -1;
				}else{
					if(this._slideId){ this._stop(); }
					return false;
				}
			}

			this.showImage(this.imageIndex + 1, lang.hitch(this,function(){
				if(inTimer){ this._startTimer(); }
			}));
			return true;
		},

		toggleSlideShow: function(){
			// summary:
			//		Switches the slideshow mode on and off.

			// If the slideshow is already running, stop it.
			if(this._slideId){
				this._stop();
			}else{
				domClass.toggle(this.domNode,"slideShowPaused");
				this._timerCancelled = false;
				var idx = this.imageIndex;

				if(idx < 0 || (this.images[idx] && this.images[idx]._img.complete)){
					var success = this.showNextImage(true, true);

					if(!success){
						this._stop();
					}
				}else{
					var handle = topic.subscribe(this.getShowTopicName(), lang.hitch(this, function(info){
						setTimeout(lang.hitch(this, function(){
							if(info.index == idx){
								var success = this.showNextImage(true, true);
								if(!success){
									this._stop();
								}
								topic.unsubscribe(handle);
							}}),
							this.slideshowInterval * 1000);
					}));
					topic.publish(this.getShowTopicName(),
					  {index: idx,	title: "", url: ""});
				}
			}
		},

		getShowTopicName: function(){
			// summary:
			//		Returns the topic id published to when an image is shown
			// description:
			//		The information published is: index, title and url
			return (this.widgetId || this.id) + "/imageShow";
		},

		getLoadTopicName: function(){
			// summary:
			//		Returns the topic id published to when an image finishes loading.
			// description:
			//		The information published is the index position of the image loaded.
			return (this.widgetId ? this.widgetId : this.id) + "/imageLoad";
		},

		showImage: function(index, /* Function? */callback){
			// summary:
			//		Shows the image at index 'index'.
			// index: Number
			//		The position of the image in the data store to display
			// callback: Function
			//		Optional callback function to call when the image has finished displaying.

			if(!callback && this._slideId){
				this.toggleSlideShow();
			}
			var _this = this;
			var current = query("div", this.largeNode);
			this.imageIndex = index;

			var showOrLoadIt = function() {
				//If the image is already loaded, then show it.
				if(_this.images[index]){
					while(_this.largeNode.firstChild){
						_this.largeNode.removeChild(_this.largeNode.firstChild);
					}
					domStyle.set(_this.images[index],"opacity", 0);
					domConstruct.place(_this.images[index], _this.largeNode);
					_this._currentImage = _this.images[index]._img;
					_this._fitSize();

					var onEnd = function(a,b,c){

						var img = _this.images[index].firstChild;
						if(img.tagName.toLowerCase() != "img"){ img = img.firstChild; }
						var title = domAttr.get(img, "title") || "";
						if(_this._navShowing){
							_this._showNav(true);
						}
						topic.publish(_this.getShowTopicName(), {
							index: index,
							title: title,
							url: domAttr.get(img, "src")
						});

	        				if(callback) {
	        					callback(a,b,c);
	        				}
						_this._setTitle(title);
		        		};

					fx.fadeIn({
						node: _this.images[index],
						duration: 300,
						onEnd: onEnd
					}).play();

				}else{
					//If the image is not loaded yet, load it first, then show it.
					_this._loadImage(index, function(){
						_this.showImage(index, callback);
					});
				}
			};

			//If an image is currently showing, fade it out, then show
			//the new image. Otherwise, just show the new image.
			if(current && current.length > 0){
				fx.fadeOut({
					node: current[0],
					duration: 300,
					onEnd: function(){
						domConstruct.place(current[0], _this.hiddenNode);
						showOrLoadIt();
					}
				}).play();
			}else{
				showOrLoadIt();
			}
		},

		_fitSize: function(force){
			// summary:
			//		Fits the widget size to the size of the image being shown,
			//		or centers the image, depending on the value of 'fixedHeight'
			// force: Boolean
			//		If true, the widget is always resized, regardless of the value of 'fixedHeight'
			if(!this.fixedHeight || force){
				var height = (this._currentImage.height + (this.hasNav ? 20:0));
				domStyle.set(this.innerWrapper, "height", height + "px");
				return;
			}
			domStyle.set(this.largeNode, "paddingTop", this._getTopPadding() + "px");
		},

		_getTopPadding: function(){
			// summary:
			//		Returns the padding to place at the top of the image to center it vertically.
			if(!this.fixedHeight){ return 0; }
			return (this.imageHeight - this._currentImage.height) / 2;
		},

		_loadNextImage: function(){
			// summary:
			//		Load the next unloaded image.

			if(!this.autoLoad){
				return;
			}
			while(this.images.length >= this._imageCounter && this.images[this._imageCounter]){
				this._imageCounter++;
			}
			this._loadImage(this._imageCounter);
		},

		_loadImage: function(index, callbackFn){
			// summary:
			//		Load image at specified index
			// description:
			//		This function loads the image at position 'index' into the
			//		internal cache of images.  This does not cause the image to be displayed.
			// index:
			//		The position in the data store to load an image from.
			// callbackFn:
			//		An optional function to execute when the image has finished loading.

			if(this.images[index] || !this._request) {
				return;
			}

			var pageStart = index - (index % (this._request.count || this.pageSize));

			this._request.start = pageStart;

			this._request.onComplete = function(items){
				var diff = index - pageStart;

				if(items && items.length > diff){
					loadIt(items[diff]);
				}else{ /* Squelch - console.log("Got an empty set of items"); */ }
			};

			var _this = this;
			var store = this.imageStore;
			var loadIt = function(item){
				var url = _this.imageStore.getValue(item, _this.imageLargeAttr);

				var img = new Image();	// when creating img with "createElement" IE doesnt has width and height, so use the Image object
				var div = domConstruct.create("div", {
					id: _this.id + "_imageDiv" + index
				});
				div._img = img;

				var link = _this.imageStore.getValue(item,_this.linkAttr);
				if(!link || _this.noLink){
					domConstruct.place(img, div);
				}else{
					var a = domConstruct.create("a", {
						"href": link,
						"target": "_blank"
					}, div);
					domConstruct.place(img, a);
				}

				on(img, "load", function(){
					if(store != _this.imageStore){
						// If the store has changed, ignore this load event.
						return;
					}
					_this._fitImage(img);
					domAttr.set(div, {"width": _this.imageWidth, "height": _this.imageHeight});

					// make a short timeout to prevent IE6/7 stack overflow at line 0 ~ still occuring though for first image
					topic.publish(_this.getLoadTopicName(), index);

					setTimeout(function(){_this._loadNextImage();}, 1);
					if(callbackFn){ callbackFn(); }
				});
				domConstruct.place(div, _this.hiddenNode);

				domConstruct.create("div", {
					className: "slideShowTitle"
				}, div);

				_this.images[index] = div;
				domAttr.set(img, "src", url);

				var title = _this.imageStore.getValue(item, _this.titleAttr);
				if(title){ domAttr.set(img, "title", title); }
			};
			this.imageStore.fetch(this._request);
		},

		_stop: function(){
			// summary:
			//		Stops a running slide show.
			if(this._slideId){ clearTimeout(this._slideId); }
			this._slideId = null;
			this._timerCancelled = true;
			domClass.remove(this.domNode,"slideShowPaused");
		},

		_prev: function(){
			// summary:
			//		Show the previous image.

			// FIXME: either pull code from showNext/prev, or call it here
			if(this.imageIndex < 1){ return; }
			this.showImage(this.imageIndex - 1);
		},

		_next: function(){
			// summary:
			//		Show the next image
			this.showNextImage();
		},

		_startTimer: function(){
			// summary:
			//		Starts a timeout to show the next image when a slide show is active
			var id = this.id;
			this._slideId = setTimeout(function(){
				registry.byId(id).showNextImage(true);
			}, this.slideshowInterval * 1000);
		},

		_calcNavDimensions: function() {
			// summary:
			//		Calculates the dimensions of the navigation controls
			domStyle.set(this.navNode, "position", "absolute");

			//Place the navigation controls far off screen
			domStyle.set(this.navNode, "top", "-10000px");

			domStyle.set(this.navPlay, "marginLeft", 0);

			this.navPlay._size = domGeometry.getMarginBox(this.navPlay);
			this.navPrev._size = domGeometry.getMarginBox(this.navPrev);
			this.navNext._size = domGeometry.getMarginBox(this.navNext);

			domStyle.set(this.navNode, {"position": "", top: ""});
		},

		_setTitle: function(title){
			// summary:
			//		Sets the title to the image being displayed
			// title: String
			//		The String title of the image

			this.titleNode.innerHTML = string.substitute(this.titleTemplate,{
				title: title,
				current: 1 + this.imageIndex,
				total: this.maxPhotos || ""
			});
		},

		_fitImage: function(img) {
			// summary:
			//		Ensures that the image width and height do not exceed the maximum.
			// img: Node
			//		The image DOM node to optionally resize
			var width = img.width;
			var height = img.height;

			if(width > this.imageWidth){
				height = Math.floor(height * (this.imageWidth / width));
				img.height = height;
				img.width = width = this.imageWidth;
			}
			if(height > this.imageHeight){
				width = Math.floor(width * (this.imageHeight / height));
				img.height = this.imageHeight;
				img.width = width;
			}
		},

		_handleClick: function(/* Event */e){
			// summary:
			//		Performs navigation on the images based on users mouse clicks
			// e:
			//		An Event object
			switch(e.target){
				case this.navNext: this._next(); break;
				case this.navPrev: this._prev(); break;
				case this.navPlay: this.toggleSlideShow(); break;
			}
		},

		_showNav: function(force){
			// summary:
			//		Shows the navigation controls
			// force: Boolean
			//		If true, the navigation controls are repositioned even if they are
			//		currently visible.
			if(this._navShowing && !force){return;}
			this._calcNavDimensions();
			domStyle.set(this.navNode, "marginTop", "0px");

			var navPlayPos = domStyle.get(this.navNode, "width")/2 - this.navPlay._size.w/2 - this.navPrev._size.w;
			domStyle.set(this.navPlay, "marginLeft", navPlayPos + "px");
			var wrapperSize = domGeometry.getMarginBox(this.outerNode);

			var margin = this._currentImage.height - this.navPlay._size.h - 10 + this._getTopPadding();

			if(margin > this._currentImage.height){margin += 10;}
			domClass[this.imageIndex < 1 ? "add":"remove"](this.navPrev, "slideShowCtrlHide");
			domClass[this.imageIndex + 1 >= this.maxPhotos ? "add":"remove"](this.navNext, "slideShowCtrlHide");

			var _this = this;
			if(this._navAnim) {
				this._navAnim.stop();
			}
			if(this._navShowing){ return; }
			this._navAnim = fx.fadeIn({
				node: this.navNode,
				duration: 300,
				onEnd: function(){ _this._navAnim = null; }
			});
			this._navAnim.play();
			this._navShowing = true;
		},

		_hideNav: function(/* Event */e){
			// summary:
			//		Hides the navigation controls
			// e: Event
			//		The DOM Event that triggered this function
			if(!e || !this._overElement(this.outerNode, e)){
				var _this = this;
				if(this._navAnim){
					this._navAnim.stop();
				}
				this._navAnim = fx.fadeOut({
					node: this.navNode,
					duration:300,
					onEnd: function(){ _this._navAnim = null; }
				});
				this._navAnim.play();
				this._navShowing = false;
			}
		},

		_overElement: function(/*DomNode*/element, /*Event*/e){
			// summary:
			//		Returns whether the mouse is over the passed element.
			//		Element must be display:block (ie, not a `<span>`)

			//When the page is unloading, if this method runs it will throw an
			//exception.
			// TODO: FIXME, should not depend on a global dojo
			if(typeof(dojo) == "undefined"){ return false; }
			element = dom.byId(element);
			var m = { x: e.pageX, y: e.pageY };
			var bb = domGeometry.position(element, true);

			return (m.x >= bb.x &&
				m.x <= (bb.x + bb.w) &&
				m.y >= bb.y &&
				m.y <= (top + bb.h)
			);	//	boolean
		}
	});
});
