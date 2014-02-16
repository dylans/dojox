define([
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/fx",
	"dojo/cldr/supplemental",
	"dojo/date",
	"dojo/date/locale",
	"dojo/dom",
	"dojo/dom-attr",
	"dojo/dom-class",
	"dojo/dom-geometry",
	"dijit/_WidgetBase",
	"dijit/_TemplatedMixin",
	"dijit/_WidgetsInTemplateMixin",
	"dojo/text!./resources/DateTimeTextBox.html",
	"dijit/Calendar",
	"dijit/form/TimeTextBox",
	"dijit/form/Button"
], function(declare, lang, fx, cldr, date, locale, dom, domAttr, domClass, domGeom,
	_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, template
){
	/*
		FIXME:
		This widget is experimental, and is the result of https://bugs.dojotoolkit.org/ticket/10352
		Work is needed in the following areas:
			* Make it work with a11y
			* Allow date/time to be formatted via parameters instead of hardcoded
			* Use Dijit's dropdown capabilities
			* Test it on versions of IE and mobile devices
			* Verify that data integrity works when initializing
			* Declarative case fails
			* Widget cannot be closed if date or time is invalid
			* Reliance on a target node is somewhat strange
			* Add more test cases
			* Add inline API documentation
	*/
	return declare([ _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin ], {
		templateString : template, 
		class: "DateTimeTextBox",
		target : "",
		time : new Date(),
		postCreate : function() {
			var controller = this;
			controller.timeWidget.set("value", new Date());
			this.okButton.on("click", lang.hitch(this, "_onClose"));
			this.timeWidget.watch("value", lang.hitch(this, "_onModify"));
			this.calendarWidget.watch("value", lang.hitch(this, "_onModify"));
		},

		_onOpen: function(evt) {
			this.calendarWidget.set("value", new Date(this.textBoxNode.value));
			this.timeWidget.set("value", new Date(this.textBoxNode.value));
			domClass.add(this.calendarTimeNode, "open")
			// FIXME: the following does not seem very efficient
			var coord = domGeom.position(this.textBoxNode);
			this.calendarTimeNode.style.left = coord.x  + "px";
			this.calendarTimeNode.style.top = coord.y +(coord.h)+ "px";
		},

		_getValueAttr: function() {
			return locale.format(this.calendarWidget.get("value"),
				{
					datePattern : "M/dd/yyyy",
					selector : "date"
				}) + " " + locale.format(this.timeWidget.get("value"),
				{
					timePattern : "hh:mm:ss a",
					selector : "time"
			});
		},

		_setValueAttr: function(datetime) {
			this.textBoxNode.value = datetime;
			this._set("value", datetime);
		},

		_onModify: function() {
			this.set("value", locale.format(this.calendarWidget.get("value"),
				{
					datePattern : "M/dd/yyyy",
					selector : "date"
				}) + " " + locale.format(this.timeWidget.get("value"),
				{
					timePattern : "hh:mm:ss a",
					selector : "time"
			}));
		},

		_onClose: function(evt) {
			this.target = dom.byId(domAttr.get(this.calendarTimeNode, "target"));
			this.target.value = locale.format(this.calendarWidget.get("value"),
				{
					datePattern : "M/dd/yyyy",
					selector : "date"
				}) + " " + locale.format(this.timeWidget.get("value"),
				{
					timePattern : "hh:mm:ss a",
					selector : "time"
			});
			this.textBoxNode.value = this.target.value;
			domClass.remove(this.calendarTimeNode, "open");
			evt.preventDefault();
		}
	});
});
