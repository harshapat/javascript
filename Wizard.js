/*global dojo dijit viper */

dojo.provide('viper.widget.Wizard');

dojo.require('dijit.Dialog');
dojo.require('dijit.layout.ContentPane');
dojo.require('dijit.layout.StackContainer');
dojo.require('dijit.layout.LayoutContainer');
dojo.require('dijit.form.Button');

dojo.require('viper.exceptions.Exception');
dojo.require('viper.exceptions.StandardExceptions');
dojo.require('viper.utils.StyleHelper');

/**
 * Represents a Wizard control
 * @extends Object
 */
dojo.declare('viper.widget.Wizard', null, {

    /**
     * @public
     * @static
     */
    stdNavInstructions: {
        forwardOne: { navType: 'forward', data: 1, wizardProgress: 'proceed' },
        backOne: { navType: 'backward', data: 1, wizardProgress: 'rewind' },
        finish: { navType: 'finish' }
    },

    title: '',
    width: '400px',
    height: '400px',

    pageBuilder: null,
    onPagesChangedHandle: null,
    pageControllers: null,

    header: null,
    headerTitle: null,
    headerDescription: null,
    stackContainer: null,
    dialog: null,
    nextButton: null,
    backButton: null,
    cancelButton: null,
    result: 'cancel',
    destroyed: false,

    buttonEventHandle: null,
    navigationEventHandle: null,

    constructor: function (config) {
        if (typeof config.title === 'string') {
            this.title = config.title;
        }
        if (typeof config.width === 'string') {
            this.width = config.width;
        }
        if (typeof config.height === 'string') {
            this.height = config.height;
        }
        if (typeof config.onClose === 'function') {
            dojo.connect(this, 'onClose', config.onClose);
        }
        if (typeof config.pageBuilder === 'object') {
            this.pageBuilder = config.pageBuilder;
            this.onPagesChangedHandle = dojo.connect(this.pageBuilder, 'onPagesChanged', dojo.hitch(this, 'pageBuilder_onPagesChanged'));
        }

        this.pageControllers = [];
    },

    addPageController: function (pageController) {
        this.pageControllers.push(pageController);
    },

    show: function () {
        var t = this;

        if (!this.destroyed) {
            this.dialog = new dijit.Dialog({
                title: this.title,
                content: this.createWizardWidget(),
                style: {
                    padding: '0px'
                },
                onHide: function () {
                    setTimeout(function () {
                        if (this.onPagesChangedHandle !== null) {
                            dojo.disconnect(this.onPagesChangedHandle);
                        }

                        t.dialog.destroyRecursive();

                        // Raise the event to indicate that the wizard has closed
                        t.onClose(t.result);
                    }, 0);
                }
            });
            viper.utils.StyleHelper.prototype.styleDialog(this.dialog);

            // By default the container node has padding ... we don't want it
            dojo.addClass(this.dialog.containerNode, 'unpadded');

            // Override the hide function so we can inhibit closure
            this.dialog.hide = function() {
                t.beginCancelPhase(t.stackContainer.selectedChildWidget.pageController, function (allow) {
                    if (allow) {
                        t.dialog.constructor.prototype.hide.apply(t.dialog);
                    }
                });
            };

            this.dialog.show();
        }
        else {
            throw viper.exceptions.StandardExceptions.prototype.createInvalidOperationException(
                'The wizard has already been destroyed.', null);
        }
    },

    /**
     * @public
     * @param result
     */
    close: function (result) {
        this.result = result;
        this.dialog.hide();
    },

    /**
     * @event
     * @param result
     */
    onClose: function (result) { },

    createWizardWidget: function () {
        var buttonPane, widgetPane, lc, page, i;

        this.header = new dijit.layout.ContentPane({
            content: this.createHeaderContent(),
            'class': 'wizardHeader dialogPadding',
            region: 'top',
            style: {
                height: '50px',
                padding: '0px'
            }
        });

        this.stackContainer = new dijit.layout.StackContainer({
            region: 'center'
        });

        buttonPane = new dijit.layout.ContentPane({
            region: 'bottom',
            style: {
                height: '24px',
                textAlign: 'right'
            }
        });
        this.createNavigationButtons(buttonPane);

        lc = new dijit.layout.LayoutContainer();
        lc.addChild(this.header);
        lc.addChild(this.stackContainer);
        lc.addChild(buttonPane);

        widgetPane = new dijit.layout.ContentPane({
            content: lc,
            style: {
                padding: '0px',
                width: this.width,
                height: this.height
            }
        });

        this.updatePages();

        // Create all of the pages using the page controller objects, then store them in the stack container
        /*for (i = 0; i < this.pageControllers.length; i++) {
            page = this.pageControllers[i].createView();
            page.pageController = this.pageControllers[i];
            this.stackContainer.addChild(page);
        }

        // Load the first page
        this.loadPage(0);*/

        return widgetPane;
    },

    createHeaderContent: function () {
        var header = dojo.create('div');

        this.headerTitle = dojo.create('div', {
            'class': 'wizardHeaderTitle dialogHalfVertSpacing'
        });
        header.appendChild(this.headerTitle);

        this.headerDescription = dojo.create('div', {
            'class': 'wizardHeaderDescription dialogSingleIndent'
        });
        header.appendChild(this.headerDescription);

        return header;
    },

    createNavigationButtons: function (buttonPane) {
        var t = this;

        this.nextButton = new dijit.form.Button({
            label: "Next &gt;",
            onClick: function () {
                t.nextClicked();
            }
        });

        this.backButton = new dijit.form.Button({
            label: "&lt; Back",
            onClick: function () {
                t.backClicked();
            }
        });

        this.cancelButton = new dijit.form.Button({
            label: "Cancel",
            onClick: function () {
                t.cancelClicked();
            }
        });

        buttonPane.domNode.appendChild(this.backButton.domNode);
        buttonPane.domNode.appendChild(this.nextButton.domNode);
        buttonPane.domNode.appendChild(this.cancelButton.domNode);
    },

    nextClicked: function() {
        this.navigateForButtonClick(this.stackContainer.selectedChildWidget.pageController, 'next');
    },

    backClicked: function () {
        this.navigateForButtonClick(this.stackContainer.selectedChildWidget.pageController, 'back');
    },

    cancelClicked: function () {
        var t = this, pageController = this.stackContainer.selectedChildWidget.pageController;

        // Check whether it's OK to cancel before we do so
        t.beginCancelPhase(pageController, function (allow) {
            if (allow) {
                t.close('cancel');
            }
        });
    },

    beginActivatingPhase: function (pageController, action) {
        if (pageController.beginActivating) {
            pageController.beginActivating(function () {
                action();
            });
        }
        else {
            action();
        }
    },

    beginActivatePhase: function (pageController, action) {
        if (pageController.beginActivate) {
            pageController.beginActivate(function () {
                action();
            });
        }
        else {
            action();
        }
    },

    beginDeactivatePhase: function (pageController, direction, action) {
        if (pageController.beginDeactivate) {
            pageController.beginDeactivate(direction, function () {
                action();
            });
        }
        else {
            action();
        }
    },

    beginValidatePhase: function (pageController, action) {
        if (pageController.beginValidate) {
            pageController.beginValidate(function (validated) {
                action(validated);
            });
        }
        else {
            action(true);
        }
    },

    beginCommitPhase: function (pageController, action) {
        if (pageController.beginCommit) {
            pageController.beginCommit(function (success) {
                action(success);
            });
        }
        else {
            action(true);
        }
    },

    beginCancelPhase: function (pageController, action) {
        if (pageController.beginCancel) {
            pageController.beginCancel(function (allow) {
                action(allow);
            });
        }
        else {
            action(true);
        }
    },

    navigateForButtonClick: function (pageController, button) {
        var pages, currentIndex, instruction = null;

        // First try to get the navigation instruction from the page controller
        // It is valid for the page controller to return null; this indicates that we should use the default action
        if (pageController.getNavigationInstruction) {
            instruction = pageController.getNavigationInstruction(button);
            if (instruction !== null) {
                this.navigate(pageController, instruction);
            }
        }

        // Execute the default action if we didn't get an instruction from the page controller
        if (instruction === null) {
            pages = this.stackContainer.getChildren();
            currentIndex = dojo.indexOf(pages, this.stackContainer.selectedChildWidget);

            if (button === 'next') {
                // Find out whether this is the last page in the sequence
                if (currentIndex === pages.length - 1) {
                    // Send the instruction to finish the wizard
                    this.navigate(pageController, { navType: 'finish' });
                }
                else {
                    // Send the instruction to go forward one page
                    this.navigate(pageController, { navType: 'forward', data: 1, wizardProgress: 'proceed' });
                }
            }
            else {
                // Only go back if this is not the first page in the sequence
                if (currentIndex > 0) {
                    // Send the instruction to go back one page
                    this.navigate(pageController, { navType: 'backward', data: 1, wizardProgress: 'rewind' });
                }
            }
        }
    },

    navigate: function (pageController, instruction) {
        var pages, currentIndex, targetIndex, finish = false;

        pages = this.stackContainer.getChildren();
        currentIndex = dojo.indexOf(pages, this.stackContainer.selectedChildWidget);

        switch (instruction.navType) {
            case 'forward':
                targetIndex = currentIndex + instruction.data;
                break;

            case 'backward':
                targetIndex = currentIndex - instruction.data;
                break;

            case 'index':
                targetIndex = instruction.data;
                break;

            case 'id':
                targetIndex = this.findPageIndex(instruction.data);
                if (targetIndex < 0) {
                    throw viper.exceptions.StandardExceptions.prototype.createArgumentOutOfRangeException(
                        "A wizard page with Id '" + instruction.data + "' does not exist.", null);
                }
                break;

            case 'finish':
                finish = true;
                break;
        }

        // Let the caller know if an invalid index was selected
        if (targetIndex < 0 || targetIndex >= pages.length) {
            throw viper.exceptions.StandardExceptions.prototype.createArgumentOutOfRangeException(
                "A wizard page does not exist at index '" + targetIndex + "'.", null);
        }

        if (instruction.wizardProgress === 'proceed' || finish) {
            this.proceed(pageController, targetIndex, finish);
        }
        else if (instruction.wizardProgress === 'rewind') {
            this.rewind(pageController, targetIndex);
        }
        else {
            throw viper.exceptions.StandardExceptions.prototype.createInvalidOperationException(
                "The 'wizardProgress' command '" + instruction.wizardProgress + "' is not supported.", null);
        }
    },

    findPageIndex: function (id) {
        var i, pages, page, index = -1;

        pages = this.stackContainer.getChildren();
        for (i = 0; i < pages.length; i++) {
            page = pages[i];
            if (page.pageController.getId) {
                if (page.pageController.getId() === id) {
                    index = i;
                    break;
                }
            }
        }

        return index;
    },

    proceed: function (pageController, index, finish) {
        var page, t = this;

        // Get the controller for the current page
        page = t.stackContainer.selectedChildWidget;
        pageController = page.pageController;

        // Disable the buttons during async operations
        t.disableAllButtons();

        // Execute the validation and commit phases, then navigate forwards
        t.beginValidatePhase(pageController, function (valid) {
            if (valid) {
                t.beginCommitPhase(pageController, function (success) {
                    if (success) {
                        // Deactivate the previous page when it goes out of view
                        t.beginDeactivatePhase(pageController, 'forward', function () {
                            // Proceed to the next page if validation was successful and there is another page
                            if (!finish) {
                                // Load the page into context
                                t.loadPage(index);
                            }
                            else {
                                // Close the dialog
                                t.close('ok');
                            }
                        });
                    }
                    else {
                        // Failed to commit, reset the button states
                        t.updateButtonStates(pageController);
                    }
                });
            }
            else {
                // Failed to validate, reset the button states
                t.updateButtonStates(pageController);
            }
        });
    },

    rewind: function (pageController, index) {
        var pages, currentPage, isFirstPage, t = this;

        // Find out whether this is the first page in the sequence
        pages = this.stackContainer.getChildren();
        currentPage = this.stackContainer.selectedChildWidget;
        isFirstPage = dojo.indexOf(pages, currentPage) === 0;

        if (!isFirstPage) {
            // Deactivate the previous page when it goes out of view
            t.beginDeactivatePhase(pageController, 'backward', function () {
                // Load the page into context
                t.loadPage(index);
            });
        }
    },

    getControllerAtIndex: function (index) {
        var pages;

        pages = this.stackContainer.getChildren();
        return pages[index].pageController;
    },

    selectPage: function (index) {
        var page;

        page = this.stackContainer.getChildren()[index];
        this.stackContainer.selectChild(page, false);
    },

    loadPage: function (index) {
        var pageController, t = this, title = '', description = '';

        pageController = this.getControllerAtIndex(index);

        // Update the page title
        if (pageController.getPageTitle) {
            title = pageController.getPageTitle();
        }
        dojo.html.set(this.headerTitle, title);

        // Update the page description
        if (pageController.getPageDescription) {
            description = pageController.getPageDescription();
        }
        dojo.html.set(this.headerDescription, description);

        // Allow page controllers to do preparation before their page comes into view
        t.beginActivatingPhase(pageController, function () {

            // Do the actual page swap
            t.selectPage(index);

            // Activate the page when it comes into view
            t.beginActivatePhase(pageController, function () {
                t.updateButtonStates(pageController);

                // Disconnect event handling on the previous page
                if (t.buttonEventHandle !== null) {
                    dojo.disconnect(t.buttonEventHandle);
                    t.buttonEventHandle = null;
                }

                if (t.navigationEventHandle !== null) {
                    dojo.disconnect(t.navigationEventHandle);
                    t.navigationEventHandle = null;
                }

                // Connect to the button state change event on the new page
                if (pageController.onNavigationButtonStateChange) {
                    t.buttonEventHandle = dojo.connect(pageController, 'onNavigationButtonStateChange', function () {
                        t.updateButtonStates(pageController);
                    });
                }

                // Connect to the navigation event on the new page
                if (pageController.onNavigationRequest) {
                    t.navigationEventHandle = dojo.connect(pageController, 'onNavigationRequest', function (instruction) {
                        t.navigate(pageController, instruction);
                    });
                }
            });
        });
    },

    updateButtonStates: function (pageController) {
        var defaults, buttonStates, children, index, isLast;

        children = this.stackContainer.getChildren();
        index = dojo.indexOf(children, this.stackContainer.selectedChildWidget);
        isLast = index === children.length - 1;
        defaults = {
            next: { state: 'enabled', label: isLast ? 'finish' : 'next' },
            back: { state: index > 0 ? 'enabled' : 'disabled' },
            cancel: { state: 'enabled' }
        };

        if (pageController.getButtonStates) {
            buttonStates = pageController.getButtonStates();

            // Fill-in defaults where entries have been omitted
            if (!buttonStates.next) {
                buttonStates.next = defaults.next;
            }

            if (!buttonStates.back) {
                buttonStates.back = defaults.back;
            }

            if (!buttonStates.cancel) {
                buttonStates.cancel = defaults.cancel;
            }
        }
        else {
            buttonStates = defaults;
        }

        this.applyButtonStates(buttonStates);
    },

    applyButtonStates: function (buttonStates) {
        if (buttonStates.next.label === 'finish') {
            this.nextButton.set('label', 'Finish');
        }
        else {
            this.nextButton.set('label', 'Next &gt;');
        }

        this.setButtonDisplayStyle(this.nextButton, buttonStates.next.state);
        this.setButtonDisplayStyle(this.backButton, buttonStates.back.state);
        this.setButtonDisplayStyle(this.cancelButton, buttonStates.cancel.state);
    },

    setButtonDisplayStyle: function (button, state) {
        if (state === 'hidden') {
            dojo.style(button, 'display', 'none');
        }
        else {
            dojo.style(button, 'display', 'inline-block');
            button.set('disabled', state !== 'enabled');
        }
    },

    disableAllButtons: function () {
        this.nextButton.set('disabled', true);
        this.backButton.set('disabled', true);
        this.cancelButton.set('disabled', true);
    },

    pageBuilder_onPagesChanged: function () {
        this.updatePages();
    },

    updatePages: function () {
        var currentPageController, i, pages, page, toAdd, newControllers, removeList, currentPagePreserved = false;

        // Use the page builder to generate our pages if there is one
        newControllers = this.pageControllers;
        if (this.pageBuilder !== null) {
            newControllers = this.pageBuilder.getPageControllers();
        }

        // Store the current page
        currentPageController = null;
        if (this.stackContainer.selectedChildWidget !== null &&
            typeof this.stackContainer.selectedChildWidget !== 'undefined') {
            currentPageController = this.stackContainer.selectedChildWidget.pageController;
        }

        // Clear out all of the pages except the current page (so we don't glitch the UI)
        removeList = [];
        pages = this.stackContainer.getChildren();
        for (i = 0; i < pages.length; i++) {
            if (pages[i].pageController !== currentPageController) {
                this.stackContainer.removeChild(pages[i]);
                removeList.push({ pageController: pages[i].pageController, page: pages[i], reused: false });
            }
            else {
                currentPagePreserved = true;
            }
        }

        // Create a list of page controllers and pages (no need to recreate some pages)
        toAdd = [];
        for (i = 0; i < newControllers.length; i++) {
            // Preserve the page if there is an opportunity to reuse it
            toAdd.push({ pageController: newControllers[i], page: this.reusePage(removeList, newControllers[i]) });
        }

        // Insert pages before and after the current page
        for (i = 0; i < toAdd.length; i++) {
            // Skip the current page
            if (toAdd[i].pageController !== currentPageController) {

                // Only create the view if we're not reusing a page
                page = toAdd[i].page;
                if (page === null) {
                    page = toAdd[i].pageController.createView();
                    page.pageController = toAdd[i].pageController;
                }

                this.stackContainer.addChild(page, i);
            }
        }

        // Destroy pages that weren't reused
        for (i = 0; i < removeList.length; i++) {
            if (!removeList[i].reused) {
                removeList[i].page.destroyRecursive();
            }
        }

        // Select the first child if the current page was deleted (or never existed)
        if (!currentPagePreserved) {
            this.loadPage(0);
        }

        // Store the new page controllers
        this.pageControllers = newControllers;
    },

    /**
     * @private
     * @static
     *
     * @param removeList
     * @param pageController
     */
    reusePage: function (removeList, pageController) {
        var i, page = null;

        for (i = 0; i < removeList.length; i++) {
            if (removeList[i].pageController === pageController) {
                removeList[i].reused = true;
                page = removeList[i].page;
                break;
            }
        }

        return page;
    }
});
