import hammerhead from '../deps/hammerhead';
import testCafeCore from '../deps/testcafe-core';
import testCafeRunner from '../deps/testcafe-runner';
import testCafeUI from '../deps/testcafe-ui';
import DriverStatus from '../status';
import {
    ActionElementNotFoundError,
    ActionElementIsInvisibleError,
    ActionAdditionalElementNotFoundError,
    ActionAdditionalElementIsInvisibleError,
    ActionElementNonEditableError,
    ActionElementNonContentEditableError,
    ActionRootContainerNotFoundError,
    ActionElementNotTextAreaError
} from '../../../errors/test-run';

import COMMAND_TYPE from '../../../test-run/commands/type';

var Promise                         = hammerhead.Promise;
var nativeMethods                   = hammerhead.nativeMethods;
var XhrBarrier                      = testCafeCore.XhrBarrier;
var pageUnloadBarrier               = testCafeCore.pageUnloadBarrier;
var positionUtils                   = testCafeCore.positionUtils;
var domUtils                        = testCafeCore.domUtils;
var waitFor                         = testCafeCore.waitFor;
var contentEditable                 = testCafeCore.contentEditable;
var ClickAutomation                 = testCafeRunner.get('./automation/playback/click');
var RClickAutomation                = testCafeRunner.get('./automation/playback/rclick');
var DblClickAutomation              = testCafeRunner.get('./automation/playback/dblclick');
var DragToOffsetAutomation          = testCafeRunner.get('./automation/playback/drag/to-offset');
var DragToElementAutomation         = testCafeRunner.get('./automation/playback/drag/to-element');
var HoverAutomation                 = testCafeRunner.get('./automation/playback/hover');
var TypeAutomation                  = testCafeRunner.get('./automation/playback/type');
var SelectTextAutomation            = testCafeRunner.get('./automation/playback/select/select-text');
var SelectEditableContentAutomation = testCafeRunner.get('./automation/playback/select/select-editable-content');
var getSelectPositionArguments      = testCafeRunner.get('./automation/playback/select/get-select-position-arguments');
var ProgressPanel                   = testCafeUI.ProgressPanel;


const PROGRESS_PANEL_TEXT                = 'Waiting for the target element of the next action to appear';
const CHECK_ELEMENT_DELAY                = 200;
const START_SELECTOR_ARGUMENT_NAME       = 'startSelector';
const END_SELECTOR_ARGUMENT_NAME         = 'endSelector';
const DESTINATION_SELECTOR_ARGUMENT_NAME = 'destinationSelector';


function ensureElementEditable (element) {
    if (!domUtils.isEditableElement(element))
        throw new ActionElementNonEditableError();
}

function ensureTextAreaElement (element) {
    if (!domUtils.isTextAreaElement(element))
        throw new ActionElementNotTextAreaError();
}

function ensureContentEditableElement (element, argumentTitle) {
    if (!domUtils.isContentEditableElement(element))
        throw new ActionElementNonContentEditableError(argumentTitle);
}

function ensureRootContainer (elements) {
    // NOTE: We should find a common element for the nodes to perform the select action
    if (!contentEditable.getNearestCommonAncestor(elements[0], elements[1]))
        throw new ActionRootContainerNotFoundError();

    return elements;
}

function ensureElementExists (selector, timeout, createError) {
    return waitFor(selector, CHECK_ELEMENT_DELAY, timeout)
        .catch(() => {
            throw createError();
        });
}

function ensureElementVisible (element, timeout, createError) {
    return waitFor(() => positionUtils.isElementVisible(element) ? element : null, CHECK_ELEMENT_DELAY, timeout)
        .catch(() => {
            throw createError();
        });
}

function ensureElement (selector, timeout, createNotFoundError, createIsInvisibleError) {
    var startTime = new Date();

    return ensureElementExists(() => nativeMethods.eval.call(window, selector), timeout, createNotFoundError)
        .then(element => {
            var checkVisibilityTimeout = timeout - (new Date() - startTime);

            return ensureElementVisible(element, checkVisibilityTimeout, createIsInvisibleError);
        });
}

function ensureCommandElements (command, timeout) {
    var progressPanel = new ProgressPanel();

    progressPanel.show(PROGRESS_PANEL_TEXT, timeout);

    var ensureElementPromises = [];

    if (command.selector) {
        ensureElementPromises.push(ensureElement(command.selector, timeout,
            () => new ActionElementNotFoundError(), () => new ActionElementIsInvisibleError()));
    }

    if (command.type === COMMAND_TYPE.dragToElement) {
        ensureElementPromises.push(ensureElement(command.destinationSelector, timeout,
            () => new ActionAdditionalElementNotFoundError(DESTINATION_SELECTOR_ARGUMENT_NAME),
            () => new ActionAdditionalElementIsInvisibleError(DESTINATION_SELECTOR_ARGUMENT_NAME)));
    }

    if (command.type === COMMAND_TYPE.selectEditableContent) {
        var endSelector = command.endSelector || command.startSelector;

        ensureElementPromises.push(ensureElement(command.startSelector, timeout,
            () => new ActionAdditionalElementNotFoundError(START_SELECTOR_ARGUMENT_NAME),
            () => new ActionAdditionalElementIsInvisibleError(START_SELECTOR_ARGUMENT_NAME)));

        ensureElementPromises.push(ensureElement(endSelector, timeout,
            () => new ActionAdditionalElementNotFoundError(END_SELECTOR_ARGUMENT_NAME),
            () => new ActionAdditionalElementIsInvisibleError(END_SELECTOR_ARGUMENT_NAME)));
    }

    return Promise.all(ensureElementPromises)
        .then(elements => {
            if (command.type === COMMAND_TYPE.selectText)
                ensureElementEditable(elements[0]);

            if (command.type === COMMAND_TYPE.selectTextAreaContent)
                ensureTextAreaElement(elements[0]);

            if (command.type === COMMAND_TYPE.selectEditableContent) {
                ensureContentEditableElement(elements[0], START_SELECTOR_ARGUMENT_NAME);
                ensureContentEditableElement(elements[1], END_SELECTOR_ARGUMENT_NAME);
                ensureRootContainer(elements);
            }

            return elements;
        })
        .catch(err => {
            progressPanel.close(false);
            throw err;
        })
        .then(elements => {
            progressPanel.close(true);
            return elements;
        });
}

function createAutomation (elements, command) {
    var selectArgs = null;

    /* eslint-disable indent*/
    // TODO: eslint raises an 'incorrect indent' error here. We use
    // the old eslint version (v1.x.x). We should migrate to v2.x.x
    switch (command.type) {
        case COMMAND_TYPE.click :
            return new ClickAutomation(elements[0], command.options);

        case COMMAND_TYPE.rightClick :
            return new RClickAutomation(elements[0], command.options);

        case COMMAND_TYPE.doubleClick :
            return new DblClickAutomation(elements[0], command.options);

        case COMMAND_TYPE.hover :
            return new HoverAutomation(elements[0], command.options);

        case COMMAND_TYPE.drag :
            return new DragToOffsetAutomation(elements[0], command.dragOffsetX, command.dragOffsetY, command.options);

        case COMMAND_TYPE.dragToElement :
            return new DragToElementAutomation(elements[0], elements[1], command.options);

        case COMMAND_TYPE.typeText:
            return new TypeAutomation(elements[0], command.text, command.options);

        case COMMAND_TYPE.selectText:
        case COMMAND_TYPE.selectTextAreaContent:
            selectArgs = getSelectPositionArguments(elements[0], command);

            return new SelectTextAutomation(elements[0], selectArgs.startPos, selectArgs.endPos);

        case COMMAND_TYPE.selectEditableContent:
            return new SelectEditableContentAutomation(elements[0], elements[1]);
    }
    /* eslint-enable indent*/
}

export default function executeActionCommand (command, elementAvailabilityTimeout) {
    var resolveStartPromise = null;
    var startPromise        = new Promise(resolve => resolveStartPromise = resolve);

    var completionPromise = new Promise(resolve => {
        var xhrBarrier = null;

        ensureCommandElements(command, elementAvailabilityTimeout)
            .then(elements => {
                resolveStartPromise();

                xhrBarrier = new XhrBarrier();

                return createAutomation(elements, command).run();
            })
            .then(() => {
                return Promise.all([
                    xhrBarrier.wait(),
                    pageUnloadBarrier.wait()
                ]);
            })
            .then(() => resolve(new DriverStatus({ isCommandResult: true })))
            .catch(err => resolve(new DriverStatus({ isCommandResult: true, executionError: err })));
    });

    return { startPromise, completionPromise };
}

