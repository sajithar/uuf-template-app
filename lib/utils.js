/**
 * User data.
 * @typedef {{username: string, domain: string, tenantId: string, permissions: Object.<string,
 *     string>}} User
 */

var utils = {};

(function (utils) {
    var log = new Log("utils");
    var constants = require("/lib/constants.js").constants;
    var models = require("/lib/models.js");

    /**
     * Extends the specified child object from the specified parent object.
     * @param child {Object} child object
     * @param parent {Object} parent object
     * @returns {Object} extended child object
     */
    function extend(child, parent) {
        child = child || {};
        for (var propertyName in parent) {
            if (!parent.hasOwnProperty(propertyName)) {
                continue;
            }
            var propertyValue = parent[propertyName];
            if (Array.isArray(propertyValue)) {
                child[propertyName] = propertyValue;
            } else if (typeof propertyValue === 'object') {
                child[propertyName] = extend(child[propertyName], propertyValue);
            } else if (!child.hasOwnProperty(propertyName)) {
                child[propertyName] = propertyValue;
            }
        }
        return child;
    }

    /**
     * Validates the definition object of the specified page.
     * @param page {UIComponent} page to be validated
     * @param layoutsData {Object.<string, Layout>} layouts data
     * @return {{success: boolean, message: string}} validation result
     */
    function validatePageDefinition(page, layoutsData) {
        var pageDefinition = page.definition;
        // mandatory fields
        if (!pageDefinition[constants.UI_COMPONENT_DEFINITION_VERSION]) {
            return {
                success: false,
                message: "Page '" + page.fullName + "' or its parents " + stringify(page.parents)
                         + " do not have a version."
            };
        }
        if (!pageDefinition[constants.PAGE_DEFINITION_URI]) {
            return {
                success: false,
                message: "Page '" + page.fullName + "' or its parents " + stringify(page.parents)
                         + " do not have a URI."
            };
        }
        var layoutFullName = pageDefinition[constants.PAGE_DEFINITION_LAYOUT];
        if (!layoutFullName) {
            return {
                success: false,
                message: "Page '" + page.fullName + "' or its parents " + stringify(page.parents)
                         + " do not have a layout."
            };
        } else if (!layoutsData[layoutFullName]) {
            return {
                success: false,
                message: "Layout '" + layoutFullName + "' of page '" + page.fullName
                         + "' does not exists."
            };
        }
        // optional fields
        // everything is correct
        return {success: true, message: "Valid page definition."};
    }

    /**
     * Validates the definition object of the specified div.
     * @param div {UIComponent} div to be validated
     * @return {{success: boolean, message: string}} validation result
     */
    function validateDivDefinition(div) {
        var divDefinition = div.definition;
        // mandatory fields
        if (!divDefinition[constants.UI_COMPONENT_DEFINITION_VERSION]) {
            return {
                success: false,
                message: "Div '" + div.fullName + "' or its parents " + stringify(div.parents)
                         + " do not have a version."
            };
        }
        // optional fields
        var pushedUris = divDefinition[constants.DIV_DEFINITION_PUSHED_URIS];
        if (pushedUris && !Array.isArray(pushedUris)) {
            return {
                success: false,
                message: "Pushed URIs of div '" + div.fullName
                         + "' should be a string array. Instead found '" + (typeof pushedUris)
                         + "'."
            };
        }
        // everything is correct
        return {success: true, message: "Valid div definition."};
    }

    /**
     * Compares two raw UI Components.
     * @param a {UIComponent} this UI Component
     * @param b {UIComponent} will be compared against this one
     * @return {number} if a > b then 1; if a < b then -1; if equals then 0
     */
    function compareRawUiComponents(a, b) {
        var tmpIndex = parseInt(a.definition[constants.UI_COMPONENT_DEFINITION_INDEX]);
        var aIndex = isNaN(tmpIndex) ? 1000000 : tmpIndex;
        tmpIndex = parseInt(b.definition[constants.UI_COMPONENT_DEFINITION_INDEX]);
        var bIndex = isNaN(tmpIndex) ? 1000000 : tmpIndex;

        if (aIndex == bIndex) {
            if (aIndex == 1000000) {
                // Neither 'a' nor 'b' specified index in the definition.
                return a.fullName.localeCompare(b.fullName);
            }
            if (a.children.indexOf(b.fullName) >= 0) {
                // 'b' is a child of 'a', hence 'b' should come before 'a'
                return 1;
            } else if (b.children.indexOf(a.fullName) >= 0) {
                // 'a' is a child of 'b', hence 'a' should come before 'b'
                return -1;
            } else {
                // 'a' and 'b' has same index value in their definitions.
                return a.fullName.localeCompare(b.fullName);
            }
        }
        // If 'a' should come after 'b' then return 1, otherwise -1.
        return (aIndex > bIndex) ? 1 : -1;
    }

    /**
     * Returns layout data.
     * @param layoutsDir {string} path to the layouts directory
     * @return {Object.<string, Layout>} layouts data
     */
    function getLayoutsData(layoutsDir) {
        var layoutsData = {};
        var layoutsFiles = new File(layoutsDir).listFiles();
        for (var i = 0; i < layoutsFiles.length; i++) {
            var layoutFile = layoutsFiles[i];
            if (layoutFile.isDirectory()) {
                // This is not a layout, so ignore.
                continue;
            }
            var layoutFileName = layoutFile.getName();
            var index = layoutFileName.lastIndexOf(".");
            if (layoutFileName.substr(index + 1) != "hbs") {
                // This is not a layout .hbs file.
                continue;
            }

            var layoutFullName = layoutFileName.substr(0, index);
            layoutsData[layoutFullName] = new models.Layout(layoutFullName,
                                                            layoutsDir + "/" + layoutFileName);
        }
        return layoutsData;
    }

    /**
     * @param componentType {string} UI component type (page or div)
     * @param componentsPath {string} path to directory where UI components are located
     * @param uiComponentsMap {Object.<string, UIComponent>} map to be filled with discovered components
     * @param uiComponentsList {UIComponent[]} list to be filled with discovered components
     */
    function populateComponentCollections(componentsPath, componentType, uiComponentsMap, uiComponentsList) {
        var componentsDirectories = new File(componentsPath).listFiles();
        var numberOfFiles = componentsDirectories.length;
        for (var i = 0; i < numberOfFiles; i++) {
            var componentDirectory = componentsDirectories[i];
            if (!componentDirectory.isDirectory()) {
                // This is not an UI component, so ignore.
                continue;
            }

            // UI Component name should be in {namespace}.{short_name} format.
            var componentFullName = componentDirectory.getName();
            var componentShortName = componentFullName.substr(componentFullName.lastIndexOf(".") + 1);
            if (!componentShortName || (componentShortName.length == 0)) {
                // Invalid name for an UI component
                throw new Error("Name '" + componentFullName + "' of " + componentType
                + " is invalid. Name of a " + componentType
                + " should be in {namespace}.{short_name} format.");
            }
            var componentPath = componentsPath + "/" + componentFullName;
            /** @type {UIComponent} */
            var uiComponent = new models.UIComponent();
            uiComponent.fullName = componentFullName;
            uiComponent.shortName = componentShortName;
            uiComponent.path = componentPath;
            uiComponent.type = componentType;
            // UI component's template is read form the <component_short_name>.hbs file.
            var templateFile = new File(componentPath + "/" + componentShortName + ".hbs");
            if (templateFile.isExists() && !templateFile.isDirectory()) {
                uiComponent.templateFilePath = templateFile.getPath();
            }
            // UI component's script is read form the <component_short_name>.js file.
            var scriptFile = new File(componentPath + "/" + componentShortName + ".js");
            if (scriptFile.isExists() && !scriptFile.isDirectory()) {
                uiComponent.scriptFilePath = scriptFile.getPath();
            }
            // UI component's definition is read form the <component_short_name>.json file.
            var definitionFile = new File(componentPath + "/" + componentShortName + ".json");
            if (!definitionFile.isExists() || definitionFile.isDirectory()) {
                throw new Error("Definition file of " + componentType + " '" + componentFullName
                + "' does not exists.");
            } else {
                uiComponent.definition = require(definitionFile.getPath());
            }

            uiComponentsMap[componentFullName] = uiComponent;
            uiComponentsList.push(uiComponent);
        }
    }

    /**
     * Returns data of the specified UI components (pages or divs).
     * @param componentType {string} UI component type (page or div)
     * @param componentsPath {string} path to sub-directory where UI components are located (pages or divs)
     * @return {{map: Object.<string, UIComponent>, array: UIComponent[]}} UI components' data
     */
    function getUiComponentsData(componentType, componentsPath) {
        /** @type {Object.<string, UIComponent>} */
        var uiComponentsMap = {};
        /** @type {UIComponent[]} */
        var uiComponentsList = [];

        // Traverse all component collection dirs and gather data
        var componentsCollectionDirectories = new File(constants.DIRECTORY_APP_COMPONENTS).listFiles();
        var numberOfFiles = componentsCollectionDirectories.length;
        for (var i = 0; i < numberOfFiles; i++) {
            var componentCollectionDirectory = componentsCollectionDirectories[i];
            if (!componentCollectionDirectory.isDirectory()) {
                // This is not an UI component, so ignore.
                continue;
            }
            var componentCollectionName = componentCollectionDirectory.getName();
            var componentCollectionDirectoryPath = constants.DIRECTORY_APP_COMPONENTS + '/' + componentCollectionName +
                                                   componentsPath;

            populateComponentCollections(componentCollectionDirectoryPath, componentType,
                                         uiComponentsMap, uiComponentsList);
        }
        // Inheritance chaining
        var numberOfComponents = uiComponentsList.length;
        var extendsKey = constants.UI_COMPONENT_DEFINITION_EXTENDS;
        for (i = 0; i < numberOfComponents; i++) {
            var component = uiComponentsList[i];
            var componentFullName = component.fullName;
            var componentParents = component.parents;
            var componentDefinition = component.definition;

            var parentComponentFullName = componentDefinition[extendsKey];
            while (parentComponentFullName) {
                var parentComponent = uiComponentsMap[parentComponentFullName];
                if (!parentComponent) {
                    var immediateChild = (componentParents.length == 0) ? componentFullName :
                                         componentParents[componentParents.length - 1];
                    throw new Error("Parent " + componentType + " '" + parentComponentFullName
                                    + "' of " + componentType + " '" + immediateChild
                                    + "' does not exists.");
                }

                parentComponent.children.push(component);
                componentParents.push(parentComponent);
                componentDefinition = extend(componentDefinition, parentComponent.definition);
                parentComponentFullName = parentComponent.definition[extendsKey];
            }
        }

        // Sorting
        uiComponentsList.sort(compareRawUiComponents);

        return {map: uiComponentsMap, array: uiComponentsList};
    }

    /**
     * Returns the boolean value of the specified object.
     * @param obj {Object} object to be converted to boolean
     * @param {boolean} [defaultValue=false] if <code>obj</code> is <code>null</code> or
     *     <code>undefined</code> then this values is returned
     * @return {boolean} boolean value of the parsed object
     */
    utils.parseBoolean = function (obj, defaultValue) {
        switch (typeof obj) {
            case 'boolean':
                return obj;
            case 'number':
                return (obj > 0);
            case 'string':
                var objLowerCased = obj.toLowerCase();
                return ((objLowerCased == "true") || (objLowerCased == "yes"));
            default:
                return (obj == null) ? ((defaultValue == null) ? false : defaultValue) : true;
        }
    };

    /**
     * Returns UUF configurations.
     * @return {Object} UUF configurations
     */
    utils.getConfigurations = function () {
        var confFile = new File(constants.FILE_UUF_CONF);
        if (!confFile.isExists() || confFile.isDirectory()) {
            throw new Error("Unified UI framework configurations file '" + constants.FILE_UUF_CONF
                            + "' does not exists.");
        }

        var cachedConf = application.get(constants.CACHE_KEY_UUF_CONF);
        var updateCache = false;
        if (cachedConf) {
            var cachedConfFileLMD = parseInt(application.get(constants.CACHE_KEY_UUF_CONF_FILE_LMD));
            var confFileLMD = parseInt(confFile.getLastModified());
            if (confFileLMD > cachedConfFileLMD) {
                updateCache = true;
            }
        } else {
            updateCache = true;
        }

        if (updateCache) {
            var conf = require(constants.FILE_UUF_CONF);
            application.put(constants.CACHE_KEY_UUF_CONF, conf);
            application.put(constants.CACHE_KEY_UUF_CONF_FILE_LMD,
                            String(confFile.getLastModified()));
            return conf;
        } else {
            return cachedConf;
        }
    };

    /**
     * Returns application configurations.
     * @return {Object} application configurations
     */
    utils.getAppConfigurations = function () {
        var appConfFile = new File(constants.FILE_APP_CONF);
        if (!appConfFile.isExists() || appConfFile.isDirectory()) {
            throw new Error("Application configurations file '" + constants.FILE_APP_CONF
                            + "' does not exists.");
        }

        var cachedAppConf = application.get(constants.CACHE_KEY_APP_CONF);
        var updateCache = false;
        if (cachedAppConf) {
            var cachedAppConfFileLMD = parseInt(application.get(constants.CACHE_KEY_APP_CONF_FILE_LMD));
            var appConfFileLMD = parseInt(appConfFile.getLastModified());
            if (appConfFileLMD > cachedAppConfFileLMD) {
                updateCache = true;
            }
        } else {
            updateCache = true;
        }

        if (updateCache) {
            appConfFile.open("r");
            var content = appConfFile.readAll();
            var getProperty = require("process").getProperty;
            content = content.replace(/\$\{server\.ip}/g, getProperty("carbon.local.ip"));
            content = content.replace(/\$\{server\.http_port}/g, getProperty("carbon.http.port"));
            content = content.replace(/\$\{server\.https_port}/g, getProperty("carbon.https.port"));

            var appConf = parse(content);
            application.put(constants.CACHE_KEY_APP_CONF, appConf);
            application.put(constants.CACHE_KEY_APP_CONF_FILE_LMD,
                            String(appConfFile.getLastModified()));
            return appConf;
        } else {
            return cachedAppConf;
        }
    };

    /**
     * Returns the lookup table.
     * @param configs {Object} application configurations
     * @return {LookupTable} lookup table
     */
    utils.getLookupTable = function (configs) {
        var isCachingEnabled = utils.parseBoolean(configs[constants.APP_CONF_CACHE_ENABLED]);
        if (isCachingEnabled) {
            var cachedLookupTable = application.get(constants.CACHE_KEY_LOOKUP_TABLE);
            if (cachedLookupTable) {
                return cachedLookupTable;
            }
        }

        // layouts
        var layoutsData = getLayoutsData(constants.DIRECTORY_APP_LAYOUTS);

        /** @type {Object.<string, UIComponent>} */
        var allUiComponents = {};

        // divs
        var divsData = getUiComponentsData("div", constants.DIRECTORY_APP_DIVS);
        var divsArray = divsData.array;
        var numberOfDivs = divsArray.length;
        /** @type {Object.<string, [string]>} */
        var pushedDivs = {};
        for (var i = 0; i < numberOfDivs; i++) {
            var div = divsArray[i];
            div.index = i;
            var divDefinition = div.definition;
            div.disabled =
                utils.parseBoolean(divDefinition[constants.UI_COMPONENT_DEFINITION_DISABLED]);
            if (div.disabled) {
                // This div is disabled.
                continue;
            }
            allUiComponents[div.fullName] = div;

            if (div.children.length != 0) {
                // This div is extended by one or more child div(s).
                continue;
            }
            var validationData = validateDivDefinition(div);
            if (!validationData.success) {
                // Invalid div definition.
                throw new Error(validationData.message);
            }

            var uriPatterns = divDefinition[constants.DIV_DEFINITION_PUSHED_URIS];
            if (uriPatterns) {
                var numberOfUriPatterns = uriPatterns.length;
                var divFullName = div.fullName;
                for (var n = 0; n < numberOfUriPatterns; n++) {
                    var uriPattern = uriPatterns[n];
                    if (!pushedDivs[uriPattern]) {
                        pushedDivs[uriPattern] = [];
                    }
                    pushedDivs[uriPattern].push(divFullName);
                }
            }
        }

        // pages
        var pagesData = getUiComponentsData("page", constants.DIRECTORY_APP_PAGES);
        var pagesArray = pagesData.array;
        var numberOfPages = pagesArray.length;
        /** @type {Object.<string, string>} */
        var uriPagesMap = {};
        for (var j = 0; j < numberOfPages; j++) {
            var page = pagesArray[j];
            page.index = i + j;
            var pageDefinition = page.definition;
            page.disabled =
                utils.parseBoolean(pageDefinition[constants.UI_COMPONENT_DEFINITION_DISABLED]);
            if (page.disabled) {
                // This page is disabled.
                continue;
            }
            allUiComponents[page.fullName] = page;

            if (page.children.length != 0) {
                // This page is extended by one or more child page(s).
                continue;
            }
            var validationData = validatePageDefinition(page, layoutsData);
            if (!validationData.success) {
                // Invalid page definition.
                throw new Error(validationData.message);
            }

            var pageUri = pageDefinition[constants.PAGE_DEFINITION_URI];
            if (uriPagesMap[pageUri]) {
                // Some other page is already registered for this URI.
                throw new Error("Cannot register page '" + page.fullName + "' for URI '" + pageUri
                                + "' since page '" + uriPagesMap[pageUri]
                                + "' already registered.");
            }
            uriPagesMap[pageUri] = page.fullName;
        }

        var lookupTable = {
            layouts: layoutsData,
            pages: pagesData.map,
            uriPagesMap: uriPagesMap,
            divs: divsData.map,
            pushedDivs: pushedDivs,
            uiComponents: allUiComponents
        };
        application.put(constants.CACHE_KEY_LOOKUP_TABLE, lookupTable);
        return lookupTable;
    };

    /**
     * Returns the furthest child UI component of the specified UI component.
     * @param parentUiComponent {UIComponent} UI component
     * @return {UIComponent} furthest child
     */
    utils.getFurthestChild = function (parentUiComponent) {
        if (parentUiComponent.children.length == 0) {
            // This UI component has no children.
            return parentUiComponent;
        }

        /** @type {UIComponent} */
        var furthestChild = null;
        var furthestChildDistance = -1;
        var childrenUiComponents = parentUiComponent.children;
        var numberOfChildrenUiComponents = childrenUiComponents.length;
        for (var i = 0; i < numberOfChildrenUiComponents; i++) {
            var currentChild = childrenUiComponents[i];
            // 'currentChild.parents' array contains parent UI components of the 'currentChild' UI
            // component, where first element has the nearest parent and last element has the
            // farthest parent.
            var currentChildDistance = -1;
            var currentChildParents = currentChild.parents;
            var numberOfCurrentChildParents = currentChildParents.length;
            for (var j = 0; j < numberOfCurrentChildParents; j++) {
                if (parentUiComponent.equals(currentChildParents[j])) {
                    currentChildDistance = j;
                    break;
                }
            }
            if (furthestChildDistance < currentChildDistance) {
                // Update 'furthestChild' because 'currentChild' is far away than 'furthestChild'.
                furthestChildDistance = currentChildDistance;
                furthestChild = currentChild;
            } else if (furthestChildDistance == currentChildDistance) {
                // UI component 'furthestChild' and div 'currentChild' are in the same distance
                // from the 'uiComponent'. Hence, compare those two UI components.
                switch (currentChild.compareTo(furthestChild)) {
                    case 1:
                        // (currentChild > furthestChild)
                        // Update 'furthestChild' because index of the 'currentChild' has a higher
                        // priority than 'furthestChild'.
                        furthestChildDistance = currentChildDistance;
                        furthestChild = currentChild;
                        break;
                    case 0:
                        // (currentChild == furthestChild)
                        // With the current indexing mechanism, same index value for two different
                        // UI components cannot happen. However we log it here as a precaution.
                        log.warn("Child UI component '" + furthestChild.fullName + "' and '"
                                 + currentChild.fullName + "' are in the same distance ("
                                 + currentChildDistance + ") from their parent UI component '"
                                 + parentUiComponent.fullName
                                 + "' was ignored when calculating the furthest child.");
                        break;
                    case -1:
                    // (currentChild < furthestChild) No need update 'furthestChild'.
                }
            } else {
                // (furthestChildDistance > currentChildDistance) No need to update 'furthestChild'.
            }
        }
        return furthestChild;
    };

    /**
     * Returns the file.
     * @param uiComponent {UIComponent} UI component
     * @param relativeFilePath {string} file path
     * @returns {Object} file
     */
    utils.getFileInUiComponent = function (uiComponent, relativeFilePath) {
        if (relativeFilePath.charAt(0) != "/") {
            relativeFilePath = "/" + relativeFilePath;
        }
        var childUiComponent = utils.getFurthestChild(uiComponent);

        var file = new File(childUiComponent.path + relativeFilePath);
        if (file.isExists() && !file.isDirectory()) {
            // Furthest child UI components has the file.
            return file;
        }

        var parentUiComponents = childUiComponent.parents;
        var numberOfParentUiComponents = parentUiComponents.length;
        for (var i = 0; i < numberOfParentUiComponents; i++) {
            var parentUiComponent = parentUiComponents[i];
            var parentFile = new File(parentUiComponent.path + relativeFilePath);
            if (parentFile.isExists() && !parentFile.isDirectory()) {
                // Parent UI Component has the file.
                return parentFile;
            }
        }

        return null;
    };

    /**
     * Returns the current logged-in user.
     * @returns {?User}
     */
    utils.getCurrentUser = function () {
        /** @type {User} */
        var user = session.get(constants.CACHE_KEY_USER);
        if (user && user.username) {
            // load permissions
            return user;
        }
        return null;
    };

    /**
     * Sets the current user.
     * @param username {string} username
     * @param domain {string} domain
     * @param tenantId {string} tenant ID
     */
    utils.setCurrentUser = function (username, domain, tenantId) {
        var carbon = require('carbon');
        var userManager = new carbon.user.UserManager(new carbon.server.Server(), tenantId);
        var permissionRootPath = utils.getAppConfigurations()[constants.APP_CONF_PERMISSION_ROOT];
        if (!permissionRootPath) {
            permissionRootPath = "/";
        }
        var permissions = userManager.getAllowedUIResources(username, permissionRootPath);
        var numberOfPermissions = permissions.length;
        var permissionsMap = {};
        for (var i = 0; i < numberOfPermissions; i++) {
            permissionsMap[permissions[i]] = "ui-execute";
        }
        /** @type {User} */
        var user = {
            username: username,
            domain: domain,
            tenantId: tenantId,
            permissions: permissionsMap
        };
        session.put(constants.CACHE_KEY_USER, user);
    };

    /**
     * Returns web app context path.
     * @param request {Object} HTTP request
     * @returns {string} context path
     */
    utils.getAppContext = function (request) {
        var requestContextPath = request.getContextPath();
        return (requestContextPath == "/") ? "" : requestContextPath;
    };
})(utils);
