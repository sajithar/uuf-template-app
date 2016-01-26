/**
 * Rendering context.
 * @typedef {{
 *     app: {context: string, conf: Object}, uri: string, uriParams: Object.<string,
 *     string>, user: User}} RenderingContext
 */

var renderer = {};

(function (renderer) {
    var log = new Log("dynamic-files-renderer");
    var constants = require("/lib/constants.js").constants;

    /**
     *
     * @param pageUri {string} page URI
     * @param lookupTable {LookupTable} lookup table
     * @return {string}
     */
    function getPushedDivsHandlebarsTemplate(pageUri, lookupTable) {
        var uriMatcher = new URIMatcher(pageUri);
        var pushedDivs = lookupTable.pushedDivs;
        var uriPatterns = Object.keys(pushedDivs);
        var numberOfUriPatterns = uriPatterns.length;
        var buffer = [];
        for (var i = 0; i < numberOfUriPatterns; i++) {
            var uriPattern = uriPatterns[i];
            if (uriMatcher.match(uriPattern)) {
                buffer.push('{{div "', pushedDivs[uriPattern].join('"}}{{div "'), '" }}');
            }
        }
        return (buffer.length == 0) ? null : buffer.join("");
    }

    /**
     * Renders the specified UI Component.
     * @param uiComponent {UIComponent}
     * @param templateContext {Object}
     * @param renderingContext {RenderingContext}
     * @param lookupTable {LookupTable}
     * @param response {Object}
     * @returns {boolean}
     */
    renderer.renderUiComponent = function (uiComponent, templateContext, renderingContext,
                                           lookupTable, response) {
        var template;
        if (uiComponent.type == "page") {
            var templateBuffer = ["{{#page \"", uiComponent.fullName, "\" _params=this}}"];
            var pushedDivsTemplate = getPushedDivsHandlebarsTemplate(renderingContext.uri,
                                                                       lookupTable);
            if (pushedDivsTemplate) {
                templateBuffer.push(" {{#zone \"_pushedDivs\"}} ", pushedDivsTemplate,
                                    " {{/zone}} ");
            }
            templateBuffer.push("{{/page}}");
            template = templateBuffer.join("");
        } else {
            template = "{{div \"" + uiComponent.fullName + "\" _params=this}}";
        }
        templateContext = (templateContext) ? templateContext : {};
        return renderer.renderTemplate(template, templateContext, renderingContext, lookupTable,
                                       response);
    };

    /**
     * Renders the specified Handlebars template.
     * @param template {string}
     * @param templateContext {Object}
     * @param renderingContext {RenderingContext}
     * @param lookupTable {LookupTable}
     * @param response {Object}
     * @returns {boolean}
     */
    renderer.renderTemplate = function (template, templateContext, renderingContext,
                                        lookupTable, response) {
        var handlebarsModule = require("/lib/modules/handlebars/handlebars.js");
        try {
            var html = handlebarsModule.render(template, templateContext, renderingContext,
                                               lookupTable, response);
            response.addHeader("Content-type", "text/html");
            // We don't want web browsers to cache dynamic HTML pages.
            // Adopted from http://stackoverflow.com/a/2068407/1577286
            response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            response.addHeader("Pragma", "no-cache");
            response.addHeader("Expires", "0");
            print(html);
            return true;
        } catch (e) {
            if ((typeof e) == "string") {
                // JS "throw message" type errors
                log.error(e);
                response.sendError(500, e);
            } else {
                if (e.stack) {
                    // Java/Rhino Exceptions
                    log.error(e.message, e);
                    response.sendError(500, e.message + "\n" + e.stack);
                } else if (e.message) {
                    // JS "throw new Error(message)" type errors
                    log.error(e.message);
                    response.sendError(500, e.message);
                }
            }
            return false;
        }
    };
})(renderer);
