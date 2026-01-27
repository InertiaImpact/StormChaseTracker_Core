var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
var system_url_base = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port: '') + "/" + window.location.pathname.split("/")[1] + "/public/";
var system_url_base_no_protocol = window.location.hostname + (window.location.port ? ':' + window.location.port: '') + "/" + window.location.pathname.split("/")[1] + "/public/";

var browser_isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    // Opera 8.0+ (UA detection to detect Blink/v8-powered Opera)
var browser_isFirefox = typeof InstallTrigger !== 'undefined';   // Firefox 1.0+
var browser_isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
    // At least Safari 3+: "[object HTMLElementConstructor]"
var browser_isChrome = !!window.chrome && !browser_isOpera;              // Chrome 1+
var browser_isIE = /*@cc_on!@*/false || !!document.documentMode; // At least IE6

function isEmail(email) { 
    return /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i.test(email);
}

function stringStartsWith (string, prefix) {
    return string.slice(0, prefix.length) == prefix;
}

function PrintElem(elem, title)
{
	return Popup($(elem).html(), title);
}

function Popup(data, title) 
{
	var mywindow = window.open('', 'printDiv', 'height=533,width=800');
	mywindow.document.write('<html><head><title>' + title + '</title>');
	
	mywindow.document.write("<link rel='stylesheet' type='text/css' href='" + system_url_base + "/jquery-ui-1.11.4/jquery-ui.min.css'>\r\n");
	mywindow.document.write("<link rel='stylesheet' type='text/css' href='" + system_url_base + "/common/bootstrap/css/bootstrap.min.css'>\r\n");
	mywindow.document.write("<link rel='stylesheet' type='text/css' href='" + system_url_base + "/common/bootstrap/css/jasny-bootstrap.css'>\r\n");
	mywindow.document.write("<link rel='stylesheet' type='text/css' href='" + system_url_base + "/common/bootstrap/css/bootstrap-theme.css'>\r\n");
	mywindow.document.write("<link rel='stylesheet' type='text/css' href='" + system_url_base + "/common/css/style.css'>\r\n");
  
	mywindow.document.write("<script type='text/javascript' src='" + system_url_base + "/common/js/jquery-2.1.3.min.js'> </script>\r\n");
	mywindow.document.write("<script type='text/javascript' src='" + system_url_base + "/jquery-ui-1.11.4/jquery-ui.min.js'> </script>\r\n");
	mywindow.document.write("<script type='text/javascript' src='" + system_url_base + "/common/bootstrap/js/bootstrap.min.js'> </script>\r\n");
	mywindow.document.write("<script type='text/javascript' src='" + system_url_base + "/common/bootstrap/js/jasny-bootstrap.min.js'> </script>\r\n");

	/*optional stylesheet*/ //mywindow.document.write('<link rel="stylesheet" href="main.css" type="text/css" />');
	mywindow.document.write('</head><body >');
	mywindow.document.write(data);
	mywindow.document.write('</body></html>');

	return mywindow;
}

function timeSince(when) 
{ // this ignores months
    var obj = {};
    obj._milliseconds = (new Date()).valueOf() - when.valueOf();
    obj.milliseconds = obj._milliseconds % 1000;
    obj._seconds = (obj._milliseconds - obj.milliseconds) / 1000;
    obj.seconds = obj._seconds % 60;
    obj._minutes = (obj._seconds - obj.seconds) / 60;
    obj.minutes = obj._minutes % 60;
    obj._hours = (obj._minutes - obj.minutes) / 60;
    obj.hours = obj._hours % 24;
    obj._days = (obj._hours - obj.hours) / 24;
    obj.days = obj._days % 365;
    // finally
    obj.years = (obj._days - obj.days) / 365;
    return obj;
}

function timeFromSeconds(seconds) 
{ // this ignores months
    var obj = {};
    obj._milliseconds = seconds * 1000;
    obj.milliseconds = obj._milliseconds % 1000;
    obj._seconds = (obj._milliseconds - obj.milliseconds) / 1000;
    obj.seconds = obj._seconds % 60;
    obj._minutes = (obj._seconds - obj.seconds) / 60;
    obj.minutes = obj._minutes % 60;
    obj._hours = (obj._minutes - obj.minutes) / 60;
    obj.hours = obj._hours % 24;
    obj._days = (obj._hours - obj.hours) / 24;
    obj.days = obj._days % 365;
    // finally
    obj.years = (obj._days - obj.days) / 365;
    return obj;
}

function checkBrowser(){
    c=navigator.userAgent.search("Chrome");
    f=navigator.userAgent.search("Firefox");
    m8=navigator.userAgent.search("MSIE 8.0");
    m9=navigator.userAgent.search("MSIE 9.0");
    if (c>-1){
        brwsr = "Chrome";
    }
    else if(f>-1){
        brwsr = "Firefox";
    }else if (m9>-1){
        brwsr ="MSIE 9.0";
    }else if (m8>-1){
        brwsr ="MSIE 8.0";
    }
    return brwsr;
}

function customUrlEncode(value)
{
	value = value.replace("#", "%2523");
	value = value.replace("?", "%253F");
	value = value.replace("/", "%252F");
	value = encodeURI(value);
	return value;
}

function notify(title, message)
{
	$.notify({
		icon: 'glyphicon glyphicon-exclamation-sign',
		title: '<strong>' + title + '</strong>',
		message: message
	},{
		type: 'danger',
		placement: {
			from: "top",
			align: "center"
		}
	});			
}

/**
* replaces special characters with the given value
*/
function replaceSpecial(value, replaceWith)
{
	var result = value.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,replaceWith);
	return result;
}

function checkError(error)
{
	if (error === 'Forbidden')
	{
		location.reload();
		//layout_ShowLogin();
		return false;
		//alert("Your session has expired, you will now be redirected to the login page");
		//window.location.href = system_url_base;
	}
	else
	{
		return true;
	}
}

// Checks a string for a list of characters
function countContain(strPassword, strCheck)
{ 
    // Declare variables
    var nCount = 0;

    for (i = 0; i < strPassword.length; i++) 
    {
        if (strCheck.indexOf(strPassword.charAt(i)) > -1) 
        { 
                nCount++;
        } 
    } 

    return nCount; 
} 

function scorePassword(strPassword)
{
    // Reset combination count
    var nScore = 0;
	var m_strUpperCase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	var m_strLowerCase = "abcdefghijklmnopqrstuvwxyz";
	var m_strNumber = "0123456789";
	var m_strCharacters = "!@#$%^&*?_~";
	

    // Password length
    // -- Less than 4 characters
    if (strPassword.length < 5)
    {
        nScore += 5;
    }
    // -- 5 to 7 characters
    else if (strPassword.length > 4 && strPassword.length < 8)
    {
        nScore += 10;
    }
    // -- 8 or more
    else if (strPassword.length > 7)
    {
        nScore += 25;
    }

    // Letters
    var nUpperCount = countContain(strPassword, m_strUpperCase);
    var nLowerCount = countContain(strPassword, m_strLowerCase);
    var nLowerUpperCount = nUpperCount + nLowerCount;
    // -- Letters are all lower case
    if (nUpperCount == 0 && nLowerCount != 0) 
    { 
        nScore += 10; 
    }
    // -- Letters are upper case and lower case
    else if (nUpperCount != 0 && nLowerCount != 0) 
    { 
        nScore += 20; 
    }

    // Numbers
    var nNumberCount = countContain(strPassword, m_strNumber);
    // -- 1 number
    if (nNumberCount == 1)
    {
        nScore += 10;
    }
    // -- 3 or more numbers
    if (nNumberCount >= 3)
    {
        nScore += 20;
    }

    // Characters
    var nCharacterCount = countContain(strPassword, m_strCharacters);
    // -- 1 character
    if (nCharacterCount == 1)
    {
        nScore += 10;
    }   
    // -- More than 1 character
    if (nCharacterCount > 1)
    {
        nScore += 25;
    }

    // Bonus
    // -- Letters and numbers
    if (nNumberCount != 0 && nLowerUpperCount != 0)
    {
        nScore += 2;
    }
    // -- Letters, numbers, and characters
    if (nNumberCount != 0 && nLowerUpperCount != 0 && nCharacterCount != 0)
    {
        nScore += 3;
    }
    // -- Mixed case letters, numbers, and characters
    if (nNumberCount != 0 && nUpperCount != 0 && nLowerCount != 0 && nCharacterCount != 0)
    {
        nScore += 5;
    }


    return nScore;
}


function sleep(ms) 
{
	var unixtime_ms = new Date().getTime();
	while(new Date().getTime() < unixtime_ms + ms) {}
}

function ClearSelectBox(id)
{
	var select = document.getElementById(id);
	if (select)
	{
		while(select.options.length > 0)
		{                
			select.remove(0);
		}
	}
}

function ReplaceAll(value, search, replace)
{
	return value.replace(new RegExp(search, 'g'), replace);
}

function RemoveSelectedItem(id, value)
{
	$("#" + id + " option[value='" + value + "']").each(function() {
		$(this).remove();
	});	
}

function AddSelectItem(id, value, text, disabled) 
{
    var select = document.getElementById(id);
	
	if (select)
	{
		var option = document.createElement('option');
		
		if (disabled)
		{
			option.disabled = true;
		}
		
		option.value = value;
		option.text = text;
		select.add(option);
	}
}

function GetSelectedValue(id)
{
	var e = document.getElementById(id);
	
	if (e)
	{
		if (e.selectedIndex != -1)
		{
			return e.options[e.selectedIndex].value;
		}
	}

	return "";
}

function GetSelectedText(id)
{
	var e = document.getElementById(id);
	
	if (e)
	{
		if (e.selectedIndex != -1)
		{
			return e.options[e.selectedIndex].text;
		}
	}

	return "";
}

function GetCheckboxResult(id)
{
	var e = document.getElementById(id);
	if (e)
	{
		return e.checked;
	}
	else
	{
		return false;
	}
}

function GetInputValue(id)
{
	var e = document.getElementById(id);
	return e.value;
}

function GetInputIntegerValue(id)
{
	var e = document.getElementById(id);
	
	if (e.validity && !e.validity.valid)
	{
		return -1;
	}
	if (e.value == '') e.value = 0;
	
	var value = parseInt(e.value);
	if (value != undefined)
	{
		return value;
	}
	else
	{
		return -1;
	}
}

function GetInputFloatValue(id)
{
	var e = document.getElementById(id);
	
	if (e.validity && !e.validity.valid)
	{
		return -1;
	}
	if (e.value == '') e.value = 0;
	
	var value = parseFloat(e.value);
	if (value != undefined)
	{
		return value;
	}
	else
	{
		return -1;
	}
}

function FitToContent(id, maxHeight)
{
   var text = id && id.style ? id : document.getElementById(id);
   if ( !text )
      return;

   text.style.height = 1 + "px";
   /* Accounts for rows being deleted, pixel value may need adjusting */
   if (text.clientHeight == text.scrollHeight) {
      text.style.height = "30px";
   }       

   var adjustedHeight = text.clientHeight;
   if ( !maxHeight || maxHeight > adjustedHeight )
   {
      adjustedHeight = Math.max(text.scrollHeight, adjustedHeight);
      if ( maxHeight )
         adjustedHeight = Math.min(maxHeight, adjustedHeight);
      if ( adjustedHeight > text.clientHeight )
         text.style.height = adjustedHeight + "px";
   }
}

function sleep(ms) {
    var unixtime_ms = new Date().getTime();
    while(new Date().getTime() < unixtime_ms + ms) {}
}

function previewImage(target, addr, width, height)
{
	if (!width || !height)
	{
		width = 560;
		height = 300;
	}
	
	var imageName = "previewImage-" + guid();
	var img = "<img id='" + imageName + "' name='" + imageName + "' style='width: " + width + "px; height: " + height + "px; display:block; margin:auto;' src='' />";
	document.getElementById(target).innerHTML = img;
	
	//$('#' + imageName).hide();
	$('#' + imageName).attr("src", addr); //next image path
	//still in hide
	//$('#' + imageName).load(function() 
	//{    
	//	$('#' + imageName).fadeIn('slow');
	//}); 	
}

function previewVideoCustom(target, addr, videoType, restart, width, height, controls)
{
	var playerInstance = jwplayer(target);
	playerInstance.setup({
		width: width,
		height: height,			
		autostart: 'true',
		controls: controls,
		type: videoType,
		file: addr,
		bufferlength: 0,
		events: {
			onError: function(evt)
			{
				//alert(evt.message);
				if (restart === true)
				{
					jwplayer(target).play();
				}
			},
			onPause: function(event) {
				jwplayer(target).play();
			}
		}
	});	
	
	return playerInstance;
}

function previewVideo(target, addr, videoType, restart, width, height)
{
	var playerWidth = 565;
	var playerHeight = 318;
	
	if (width)
	{
		playerWidth = width;
	}
	if (height)
	{
		playerHeight = height;
	}

	var playerInstance = jwplayer(target);
	playerInstance.setup({
		width: playerWidth,
		height: playerHeight,			
		autostart: 'true',
		controls: 'false',
		type: videoType,
		file: addr,
		bufferlength: 0,
		events: {
			onError: function(evt)
			{
				//alert(evt.message);
				if (restart === true)
				{
					jwplayer(target).play();
				}
			},
			onPause: function(event) {
				jwplayer(target).play();
			}
		}
	});	
	
	return playerInstance;
}

function previewVideoOld(target, addr)
{
	var iosDevice = false;
	
	if (navigator.userAgent.indexOf("iPad") > -1)
	{
		iosDevice = true;
	}
	var vlcAddr = "vlc://" + addr + "?.ts";
	
	if (iosDevice === true)
	{
		var newPlayer = "<div style='background-color: white; text-align: center; vertical-align: middle; height: 300px; line-height: 300px;'><a href='" + vlcAddr + "'>IOS device detected, click here to view preview</a></div>";
	}
	else
	{
		var newPlayer = "<object id='vlc' name='vlc' style='margin-left: 2px;' classid='clsid:9BE31822-FDAD-461B-AD51-BE1D1C159921' codebase='http://downloads.videolan.org/pub/videolan/vlc/latest/win32/axvlc.cab' width='560' height='315'>" + 
						"<param name='Src' value='" + addr + "' />" + 
						"<param name='ShowDisplay' value='True' />" + 
						"<param name='AutoLoop' value='no' />" + 
						"<param name='AutoPlay' value='yes' />" + 
						"<param name='Controls' value='false' />" + 
						"<embed pluginspage='http://www.videolan.org' type='application/x-vlc-plugin' id='vlcfirefox' name='vlcfirefox' Controls='false' autoplay='yes' loop='no' width='560' height='315' target='" + addr + "'></embed>" + 
						"</object>";		
	}

	document.getElementById(target).innerHTML = newPlayer;
}

function isFunction(possibleFunction) {
  return typeof(possibleFunction) === typeof(Function);
}

/**
* Replaces the contents of a div with an asynchronously loaded view
*/
function getView(addr, callback)
{
	var async = true;
	//if (async === true)
	//{
	//	async = true;
	//}
	
	$.ajax({
		url: addr,
		type: "GET",
		contentType: "application/json; charset=utf-8",
		async:async,
		cache:false,
		beforeSend:function(){ },
		success: function (response) 
		{ 
			if (isFunction)
			{
				callback(response);
			}
		}, 
		error: function (request, status, error) { checkError(error) } 
	});
}

/**
* Replaces the contents of a div with an asynchronously loaded view
*/
function replaceView_GET(target, addr, callback, useAsync)
{
	var async = true;
	//if (async === true)
	//{
	//	async = true;
	//}
	
	$.ajax({
		url: addr,
		type: "GET",
		contentType: "application/json; charset=utf-8",
		async:async,
		cache:false,
		beforeSend:function(){ },
		success: function (response) 
		{ 
			document.getElementById(target).innerHTML = response;
			$(document).ready(function(){
				$('[data-toggle="tooltip"]').tooltip();   
				
				parseScript(response);
				if (isFunction(callback))
				{
					callback();
				}
			});
		}, 
		error: function (request, status, error) { checkError(error) } 
	});
}

function ajax_PostForm(formId, url, callback)
{
	var frm = $('#' + formId);
	$.ajax({
		   type: frm.attr('method'),
		   url: frm.attr('action'),
		   data: frm.serialize(), // serializes the form's elements.
		   success: function(data)
		   {
				$(document).ready(function(){
					$('[data-toggle="tooltip"]').tooltip();   
					
					parseScript(data);
				});
			    callback(data);
		   },
		   error: function (request, status, error) { alert(error); } 
	});
}

function parseScript(_source) {
    var source = _source;
    var scripts = new Array();

    // Strip out tags
    while(source.indexOf("<script") > -1 || source.indexOf("</script") > -1) {
        var s = source.indexOf("<script");
        var s_e = source.indexOf(">", s);
        var e = source.indexOf("</script", s);
        var e_e = source.indexOf(">", e);

        // Add to scripts array
        scripts.push(source.substring(s_e+1, e));
        // Strip from source
        source = source.substring(0, s) + source.substring(e_e+1);
    }

    // Loop through every script collected and eval it
    for(var i=0; i<scripts.length; i++) {
        try {
            eval(scripts[i]);
        }
        catch(ex) {
  		    var err = e.constructor('Error in Evaled Script: ' + e.message);
			// +3 because `err` has the line number of the `eval` line plus two.
			err.lineNumber = e.lineNumber - err.lineNumber + 3;
			
			alert("Error in evaled script:  " + ex.message + ", line number " + (e.linenumber - err.linenumber + 3));
            // do what you want here when a script fails
        }
    }

    // Return the cleaned source
    return source;
}

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}