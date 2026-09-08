/**
 * cmx-ignite-thin — Ignite UI 开源组件（igniteui-webcomponents, MIT）的薄封装批量定义。
 *
 * 由 scripts/gen-ignite-palette.mjs 依据 custom-elements.json + 人工清单生成 THIN_SPECS，
 * 经 defineThinIgnite() 工厂批量生成 cmx-ignite-* 自定义元素。
 *
 * 收费包（igniteui-webcomponents-grids / -gauges）不在此处，见 cmx-ignite-grid/gauge。
 * 需 CmxDataSet 数据绑定的厚封装见 cmx-ignite-combo/list/input。
 *
 * 重新生成：node packages/cmx-data-comp/scripts/gen-ignite-palette.mjs
 */
import {
  defineComponents,
  IgcAccordionComponent,
  IgcAvatarComponent,
  IgcBadgeComponent,
  IgcBannerComponent,
  IgcButtonComponent,
  IgcButtonGroupComponent,
  IgcCalendarComponent,
  IgcCardActionsComponent,
  IgcCardComponent,
  IgcCardContentComponent,
  IgcCardHeaderComponent,
  IgcCardMediaComponent,
  IgcCarouselComponent,
  IgcCarouselSlideComponent,
  IgcChatComponent,
  IgcCheckboxComponent,
  IgcChipComponent,
  IgcCircularProgressComponent,
  IgcDatePickerComponent,
  IgcDateRangePickerComponent,
  IgcDateTimeInputComponent,
  IgcDialogComponent,
  IgcDividerComponent,
  IgcDropdownComponent,
  IgcDropdownGroupComponent,
  IgcDropdownHeaderComponent,
  IgcDropdownItemComponent,
  IgcExpansionPanelComponent,
  IgcFileInputComponent,
  IgcIconButtonComponent,
  IgcIconComponent,
  IgcInputComponent,
  IgcLinearProgressComponent,
  IgcMaskInputComponent,
  IgcNavDrawerComponent,
  IgcNavDrawerHeaderItemComponent,
  IgcNavDrawerItemComponent,
  IgcNavbarComponent,
  IgcRadioComponent,
  IgcRadioGroupComponent,
  IgcRangeSliderComponent,
  IgcRatingComponent,
  IgcRatingSymbolComponent,
  IgcSelectComponent,
  IgcSelectGroupComponent,
  IgcSelectHeaderComponent,
  IgcSelectItemComponent,
  IgcSliderComponent,
  IgcSnackbarComponent,
  IgcSplitterComponent,
  IgcStepComponent,
  IgcStepperComponent,
  IgcSwitchComponent,
  IgcTabComponent,
  IgcTabsComponent,
  IgcTextareaComponent,
  IgcTileComponent,
  IgcTileManagerComponent,
  IgcToastComponent,
  IgcToggleButtonComponent,
  IgcTooltipComponent,
  IgcTreeComponent,
  IgcTreeItemComponent,
} from 'igniteui-webcomponents'
import { ensureIgniteTheme } from './cmx-ignite-shared.js'
import { defineThinIgnite } from './cmx-ignite-factory.js'

/** 薄封装规格清单（生成产物，勿手改；改清单请改 gen 脚本的 CURATED）。 */
export const THIN_SPECS = [
    {
      "cmxTag": "cmx-ignite-input",
      "innerTag": "igc-input",
      "attrs": [
        "value",
        "type",
        "readonly",
        "inputmode",
        "pattern",
        "minlength",
        "maxlength",
        "min",
        "max",
        "step",
        "autofocus",
        "autocomplete",
        "validate-only",
        "readOnly",
        "required",
        "name",
        "disabled",
        "invalid",
        "outlined",
        "placeholder",
        "label"
      ],
      "events": [
        "igcInput",
        "igcChange"
      ],
      "valueProp": "value",
      "slots": [
        "prefix",
        "suffix",
        "helper-text",
        "value-missing",
        "type-mismatch",
        "pattern-mismatch",
        "too-long",
        "too-short",
        "range-overflow",
        "range-underflow",
        "step-mismatch",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-textarea",
      "innerTag": "igc-textarea",
      "attrs": [
        "autocomplete",
        "autocapitalize",
        "inputmode",
        "label",
        "maxlength",
        "minlength",
        "outlined",
        "placeholder",
        "readonly",
        "resize",
        "rows",
        "value",
        "spellcheck",
        "wrap",
        "validate-only",
        "required",
        "name",
        "disabled",
        "invalid"
      ],
      "events": [
        "igcInput",
        "igcChange"
      ],
      "valueProp": "value",
      "slots": [
        "",
        "prefix",
        "suffix",
        "helper-text",
        "value-missing",
        "too-long",
        "too-short",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-mask-input",
      "innerTag": "igc-mask-input",
      "attrs": [
        "value-mode",
        "value",
        "mask",
        "prompt",
        "readonly",
        "readOnly",
        "required",
        "name",
        "disabled",
        "invalid",
        "outlined",
        "placeholder",
        "label"
      ],
      "events": [
        "igcInput",
        "igcChange"
      ],
      "valueProp": "value",
      "slots": [
        "prefix",
        "suffix",
        "helper-text",
        "value-missing",
        "bad-input",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-date-time-input",
      "innerTag": "igc-date-time-input",
      "attrs": [
        "input-format",
        "value",
        "min",
        "max",
        "display-format",
        "spin-loop",
        "locale",
        "readonly",
        "mask",
        "prompt",
        "readOnly",
        "required",
        "name",
        "disabled",
        "invalid",
        "outlined",
        "placeholder",
        "label"
      ],
      "events": [
        "igcInput",
        "igcChange"
      ],
      "valueProp": "value",
      "slots": [
        "prefix",
        "suffix",
        "helper-text",
        "value-missing",
        "range-overflow",
        "range-underflow",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-file-input",
      "innerTag": "igc-file-input",
      "attrs": [
        "value",
        "locale",
        "multiple",
        "accept",
        "autofocus",
        "required",
        "name",
        "disabled",
        "invalid",
        "outlined",
        "placeholder",
        "label"
      ],
      "events": [
        "igcChange",
        "igcCancel"
      ],
      "valueProp": "value",
      "slots": [
        "prefix",
        "suffix",
        "helper-text",
        "file-selector-text",
        "file-missing-text",
        "value-missing",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-checkbox",
      "innerTag": "igc-checkbox",
      "attrs": [
        "indeterminate",
        "required",
        "name",
        "disabled",
        "invalid",
        "value",
        "checked",
        "label-position"
      ],
      "events": [
        "igcChange"
      ],
      "valueProp": "checked",
      "slots": [
        "",
        "helper-text",
        "value-missing",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-switch",
      "innerTag": "igc-switch",
      "attrs": [
        "required",
        "name",
        "disabled",
        "invalid",
        "value",
        "checked",
        "label-position"
      ],
      "events": [
        "igcChange"
      ],
      "valueProp": "checked",
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-radio-group",
      "innerTag": "igc-radio-group",
      "attrs": [
        "alignment",
        "name",
        "value"
      ],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-select",
      "innerTag": "igc-select",
      "attrs": [
        "value",
        "outlined",
        "autofocus",
        "distance",
        "label",
        "placeholder",
        "placement",
        "scroll-strategy",
        "required",
        "name",
        "disabled",
        "invalid",
        "keep-open-on-select",
        "keep-open-on-outside-click",
        "open"
      ],
      "events": [
        "igcChange",
        "igcOpening",
        "igcOpened",
        "igcClosing",
        "igcClosed"
      ],
      "valueProp": "value",
      "container": true,
      "slots": [
        "",
        "prefix",
        "suffix",
        "header",
        "footer",
        "helper-text",
        "toggle-icon",
        "toggle-icon-expanded",
        "value-missing",
        "custom-error",
        "invalid"
      ]
    },
    {
      "cmxTag": "cmx-ignite-slider",
      "innerTag": "igc-slider",
      "attrs": [
        "value",
        "name",
        "disabled",
        "invalid",
        "min",
        "max",
        "lower-bound",
        "upper-bound",
        "discrete-track",
        "hide-tooltip",
        "step",
        "primary-ticks",
        "secondary-ticks",
        "tick-orientation",
        "hide-primary-labels",
        "hide-secondary-labels",
        "locale",
        "value-format",
        "tick-label-rotation"
      ],
      "events": [
        "igcInput",
        "igcChange"
      ],
      "valueProp": "value"
    },
    {
      "cmxTag": "cmx-ignite-range-slider",
      "innerTag": "igc-range-slider",
      "attrs": [
        "lower",
        "upper",
        "thumb-label-lower",
        "thumb-label-upper",
        "min",
        "max",
        "lower-bound",
        "upper-bound",
        "disabled",
        "discrete-track",
        "hide-tooltip",
        "step",
        "primary-ticks",
        "secondary-ticks",
        "tick-orientation",
        "hide-primary-labels",
        "hide-secondary-labels",
        "locale",
        "value-format",
        "tick-label-rotation"
      ],
      "events": [
        "igcInput",
        "igcChange"
      ]
    },
    {
      "cmxTag": "cmx-ignite-rating",
      "innerTag": "igc-rating",
      "attrs": [
        "max",
        "step",
        "label",
        "value-format",
        "value",
        "hover-preview",
        "readonly",
        "single",
        "allow-reset",
        "name",
        "disabled",
        "invalid"
      ],
      "events": [
        "igcChange",
        "igcHover"
      ],
      "valueProp": "value",
      "slots": [
        "symbol",
        "value-label"
      ]
    },
    {
      "cmxTag": "cmx-ignite-calendar",
      "innerTag": "igc-calendar",
      "attrs": [
        "hide-outside-days",
        "hide-header",
        "header-orientation",
        "orientation",
        "visible-months",
        "active-view",
        "value",
        "values",
        "selection",
        "show-week-numbers",
        "week-start",
        "locale",
        "active-date"
      ],
      "events": [
        "igcChange"
      ],
      "valueProp": "value",
      "slots": [
        "",
        "title",
        "header-date"
      ]
    },
    {
      "cmxTag": "cmx-ignite-date-picker",
      "innerTag": "igc-date-picker",
      "attrs": [
        "open",
        "label",
        "mode",
        "non-editable",
        "readonly",
        "value",
        "min",
        "max",
        "header-orientation",
        "orientation",
        "hide-header",
        "hide-outside-days",
        "outlined",
        "placeholder",
        "visible-months",
        "show-week-numbers",
        "display-format",
        "input-format",
        "prompt",
        "locale",
        "active-date",
        "week-start",
        "required",
        "name",
        "disabled",
        "invalid",
        "keep-open-on-select",
        "keep-open-on-outside-click"
      ],
      "events": [
        "igcOpening",
        "igcOpened",
        "igcClosing",
        "igcClosed",
        "igcChange",
        "igcInput"
      ],
      "valueProp": "value",
      "slots": [
        "prefix",
        "suffix",
        "helper-text",
        "bad-input",
        "value-missing",
        "range-overflow",
        "range-underflow",
        "custom-error",
        "invalid",
        "title",
        "header-date",
        "clear-icon",
        "calendar-icon",
        "calendar-icon-open",
        "actions"
      ]
    },
    {
      "cmxTag": "cmx-ignite-date-range-picker",
      "innerTag": "igc-date-range-picker",
      "attrs": [
        "value",
        "mode",
        "use-two-inputs",
        "usePredefinedRanges",
        "locale",
        "readonly",
        "non-editable",
        "outlined",
        "label",
        "label-start",
        "label-end",
        "placeholder",
        "placeholder-start",
        "placeholder-end",
        "prompt",
        "display-format",
        "input-format",
        "min",
        "max",
        "visible-months",
        "header-orientation",
        "orientation",
        "hide-header",
        "show-week-numbers",
        "hide-outside-days",
        "use-predefined-ranges",
        "active-date",
        "week-start",
        "required",
        "name",
        "disabled",
        "invalid",
        "keep-open-on-select",
        "keep-open-on-outside-click",
        "open"
      ],
      "events": [
        "igcOpening",
        "igcOpened",
        "igcClosing",
        "igcClosed",
        "igcChange",
        "igcInput"
      ],
      "valueProp": "value",
      "slots": [
        "prefix",
        "prefix-start",
        "prefix-end",
        "suffix",
        "suffix-start",
        "suffix-end",
        "helper-text",
        "bad-input",
        "value-missing",
        "range-overflow",
        "range-underflow",
        "custom-error",
        "invalid",
        "title",
        "header-date",
        "clear-icon",
        "clear-icon-start",
        "clear-icon-end",
        "calendar-icon",
        "calendar-icon-start",
        "calendar-icon-end",
        "calendar-icon-open",
        "calendar-icon-open-start",
        "calendar-icon-open-end",
        "actions",
        "separator"
      ]
    },
    {
      "cmxTag": "cmx-ignite-card",
      "innerTag": "igc-card",
      "attrs": [
        "elevated"
      ],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-accordion",
      "innerTag": "igc-accordion",
      "attrs": [
        "single-expand"
      ],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-expansion-panel",
      "innerTag": "igc-expansion-panel",
      "attrs": [
        "open",
        "disabled",
        "indicator-position"
      ],
      "events": [
        "igcOpening",
        "igcOpened",
        "igcClosing",
        "igcClosed"
      ],
      "valueProp": "open",
      "container": true,
      "slots": [
        "",
        "title",
        "subtitle",
        "indicator",
        "indicator-expanded"
      ]
    },
    {
      "cmxTag": "cmx-ignite-tabs",
      "innerTag": "igc-tabs",
      "attrs": [
        "alignment",
        "activation"
      ],
      "events": [
        "igcChange"
      ],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-stepper",
      "innerTag": "igc-stepper",
      "attrs": [
        "orientation",
        "step-type",
        "linear",
        "content-top",
        "vertical-animation",
        "horizontal-animation",
        "animation-duration",
        "title-position"
      ],
      "events": [
        "igcActiveStepChanging",
        "igcActiveStepChanged"
      ],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-tree",
      "innerTag": "igc-tree",
      "attrs": [
        "single-branch-expand",
        "toggle-node-on-click",
        "selection",
        "locale"
      ],
      "events": [
        "igcSelection",
        "igcItemCollapsed",
        "igcItemCollapsing",
        "igcItemExpanded",
        "igcItemExpanding",
        "igcActiveItem"
      ],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-dropdown",
      "innerTag": "igc-dropdown",
      "attrs": [
        "placement",
        "scroll-strategy",
        "flip",
        "distance",
        "same-width",
        "keep-open-on-select",
        "keep-open-on-outside-click",
        "open"
      ],
      "events": [
        "igcChange",
        "igcOpening",
        "igcOpened",
        "igcClosing",
        "igcClosed"
      ],
      "valueProp": "open",
      "container": true,
      "slots": [
        "target",
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-carousel",
      "innerTag": "igc-carousel",
      "attrs": [
        "disable-loop",
        "disable-pause-on-interaction",
        "hide-navigation",
        "hide-indicators",
        "vertical",
        "indicators-orientation",
        "indicators-label-format",
        "slides-label-format",
        "interval",
        "maximum-indicators-count",
        "animation-type",
        "locale"
      ],
      "events": [
        "igcSlideChanged",
        "igcPlaying",
        "igcPaused"
      ],
      "container": true,
      "slots": [
        "Default",
        "previous-button",
        "next-button"
      ]
    },
    {
      "cmxTag": "cmx-ignite-nav-drawer",
      "innerTag": "igc-nav-drawer",
      "attrs": [
        "position",
        "open"
      ],
      "events": [],
      "valueProp": "open",
      "container": true,
      "slots": [
        "",
        "mini"
      ]
    },
    {
      "cmxTag": "cmx-ignite-navbar",
      "innerTag": "igc-navbar",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        "",
        "start",
        "end"
      ]
    },
    {
      "cmxTag": "cmx-ignite-button-group",
      "innerTag": "igc-button-group",
      "attrs": [
        "disabled",
        "alignment",
        "selection",
        "selectedItems",
        "selected-items"
      ],
      "events": [
        "igcSelect",
        "igcDeselect"
      ],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-dialog",
      "innerTag": "igc-dialog",
      "attrs": [
        "keep-open-on-escape",
        "close-on-outside-click",
        "hide-default-action",
        "open",
        "title"
      ],
      "events": [
        "igcClosing",
        "igcClosed"
      ],
      "valueProp": "open",
      "container": true,
      "slots": [
        "",
        "title",
        "message",
        "footer"
      ]
    },
    {
      "cmxTag": "cmx-ignite-splitter",
      "innerTag": "igc-splitter",
      "attrs": [
        "orientation",
        "disable-collapse",
        "disable-resize",
        "hide-collapse-buttons",
        "hide-drag-handle",
        "start-min-size",
        "end-min-size",
        "start-max-size",
        "end-max-size",
        "start-size",
        "end-size"
      ],
      "events": [
        "igcResizeStart",
        "igcResizing",
        "igcResizeEnd"
      ],
      "container": true,
      "slots": [
        "start",
        "end"
      ]
    },
    {
      "cmxTag": "cmx-ignite-tile-manager",
      "innerTag": "igc-tile-manager",
      "attrs": [
        "resize-mode",
        "drag-mode",
        "column-count",
        "min-column-width",
        "min-row-height",
        "gap"
      ],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-chat",
      "innerTag": "igc-chat",
      "attrs": [],
      "events": [
        "igcMessageCreated",
        "igcMessageReact",
        "igcAttachmentClick",
        "igcAttachmentAdded",
        "igcAttachmentRemoved",
        "igcAttachmentDrag",
        "igcAttachmentDrop",
        "igcTypingChange",
        "igcInputFocus",
        "igcInputBlur",
        "igcInputChange"
      ],
      "container": true,
      "slots": [
        "prefix",
        "title",
        "actions",
        "suggestions-header",
        "suggestions",
        "suggestions-actions",
        "suggestion",
        "empty-state",
        "typing-indicator"
      ]
    },
    {
      "cmxTag": "cmx-ignite-button",
      "innerTag": "igc-button",
      "attrs": [
        "variant",
        "type",
        "href",
        "download",
        "target",
        "rel",
        "disabled"
      ],
      "events": [],
      "container": true,
      "slots": [
        "",
        "prefix",
        "suffix"
      ],
      "defaultText": "按钮"
    },
    {
      "cmxTag": "cmx-ignite-icon-button",
      "innerTag": "igc-icon-button",
      "attrs": [
        "name",
        "collection",
        "mirrored",
        "variant",
        "type",
        "href",
        "download",
        "target",
        "rel",
        "disabled"
      ],
      "events": []
    },
    {
      "cmxTag": "cmx-ignite-icon",
      "innerTag": "igc-icon",
      "attrs": [
        "name",
        "collection",
        "mirrored"
      ],
      "events": []
    },
    {
      "cmxTag": "cmx-ignite-avatar",
      "innerTag": "igc-avatar",
      "attrs": [
        "src",
        "alt",
        "initials",
        "shape"
      ],
      "events": [],
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-badge",
      "innerTag": "igc-badge",
      "attrs": [
        "variant",
        "outlined",
        "shape",
        "dot"
      ],
      "events": [],
      "container": true,
      "slots": [
        ""
      ],
      "defaultText": "1"
    },
    {
      "cmxTag": "cmx-ignite-chip",
      "innerTag": "igc-chip",
      "attrs": [
        "disabled",
        "removable",
        "selectable",
        "selected",
        "variant",
        "locale"
      ],
      "events": [
        "igcRemove",
        "igcSelect"
      ],
      "valueProp": "selected",
      "container": true,
      "slots": [
        "",
        "prefix",
        "suffix",
        "select",
        "remove"
      ],
      "defaultText": "Chip"
    },
    {
      "cmxTag": "cmx-ignite-divider",
      "innerTag": "igc-divider",
      "attrs": [
        "vertical",
        "middle",
        "type"
      ],
      "events": []
    },
    {
      "cmxTag": "cmx-ignite-banner",
      "innerTag": "igc-banner",
      "attrs": [
        "open"
      ],
      "events": [
        "igcClosing",
        "igcClosed"
      ],
      "valueProp": "open",
      "container": true,
      "slots": [
        "",
        "prefix",
        "actions"
      ],
      "defaultText": "横幅内容"
    },
    {
      "cmxTag": "cmx-ignite-snackbar",
      "innerTag": "igc-snackbar",
      "attrs": [
        "action-text",
        "open",
        "display-time",
        "keep-open",
        "position"
      ],
      "events": [
        "igcAction"
      ],
      "valueProp": "open",
      "container": true,
      "slots": [
        "",
        "action"
      ],
      "defaultText": "消息"
    },
    {
      "cmxTag": "cmx-ignite-toast",
      "innerTag": "igc-toast",
      "attrs": [
        "open",
        "display-time",
        "keep-open",
        "position"
      ],
      "events": [],
      "valueProp": "open",
      "container": true,
      "defaultText": "提示"
    },
    {
      "cmxTag": "cmx-ignite-tooltip",
      "innerTag": "igc-tooltip",
      "attrs": [
        "open",
        "with-arrow",
        "offset",
        "placement",
        "anchor",
        "show-triggers",
        "hide-triggers",
        "show-delay",
        "hide-delay",
        "message",
        "sticky"
      ],
      "events": [
        "igcOpening",
        "igcOpened",
        "igcClosing",
        "igcClosed"
      ],
      "valueProp": "open",
      "container": true,
      "slots": [
        "",
        "close-button"
      ]
    },
    {
      "cmxTag": "cmx-ignite-linear-progress",
      "innerTag": "igc-linear-progress",
      "attrs": [
        "striped",
        "label-align",
        "max",
        "value",
        "variant",
        "animation-duration",
        "indeterminate",
        "hide-label",
        "label-format"
      ],
      "events": [],
      "valueProp": "value",
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-circular-progress",
      "innerTag": "igc-circular-progress",
      "attrs": [
        "max",
        "value",
        "variant",
        "animation-duration",
        "indeterminate",
        "hide-label",
        "label-format"
      ],
      "events": [],
      "valueProp": "value",
      "slots": [
        "",
        "gradient"
      ]
    },
    {
      "cmxTag": "cmx-ignite-radio",
      "innerTag": "igc-radio",
      "attrs": [
        "value",
        "checked",
        "label-position",
        "required",
        "name",
        "disabled",
        "invalid"
      ],
      "events": [
        "igcChange"
      ],
      "valueProp": "checked",
      "slots": [
        "",
        "helper-text",
        "value-missing",
        "custom-error",
        "invalid"
      ],
      "defaultText": "选项"
    },
    {
      "cmxTag": "cmx-ignite-select-item",
      "innerTag": "igc-select-item",
      "attrs": [
        "active",
        "disabled",
        "selected",
        "value"
      ],
      "events": [],
      "valueProp": "selected",
      "container": true,
      "slots": [
        "",
        "prefix",
        "suffix"
      ],
      "defaultText": "选项"
    },
    {
      "cmxTag": "cmx-ignite-select-group",
      "innerTag": "igc-select-group",
      "attrs": [
        "disabled"
      ],
      "events": [],
      "container": true,
      "slots": [
        "label",
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-select-header",
      "innerTag": "igc-select-header",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        ""
      ],
      "defaultText": "分组"
    },
    {
      "cmxTag": "cmx-ignite-rating-symbol",
      "innerTag": "igc-rating-symbol",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        "",
        "empty"
      ]
    },
    {
      "cmxTag": "cmx-ignite-card-header",
      "innerTag": "igc-card-header",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        "thumbnail",
        "title",
        "subtitle",
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-card-content",
      "innerTag": "igc-card-content",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-card-media",
      "innerTag": "igc-card-media",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-card-actions",
      "innerTag": "igc-card-actions",
      "attrs": [
        "orientation"
      ],
      "events": [],
      "container": true,
      "slots": [
        "start",
        "",
        "end"
      ]
    },
    {
      "cmxTag": "cmx-ignite-tab",
      "innerTag": "igc-tab",
      "attrs": [
        "label",
        "selected",
        "disabled"
      ],
      "events": [],
      "valueProp": "selected",
      "container": true,
      "slots": [
        "",
        "label",
        "prefix",
        "suffix"
      ],
      "defaultText": "标签"
    },
    {
      "cmxTag": "cmx-ignite-step",
      "innerTag": "igc-step",
      "attrs": [
        "invalid",
        "active",
        "optional",
        "disabled",
        "complete"
      ],
      "events": [],
      "container": true,
      "slots": [
        "",
        "indicator",
        "title",
        "subtitle"
      ]
    },
    {
      "cmxTag": "cmx-ignite-tree-item",
      "innerTag": "igc-tree-item",
      "attrs": [
        "label",
        "expanded",
        "active",
        "disabled",
        "selected",
        "loading",
        "value"
      ],
      "events": [],
      "valueProp": "selected",
      "container": true,
      "slots": [
        "",
        "label",
        "indicator",
        "loading",
        "indentation"
      ]
    },
    {
      "cmxTag": "cmx-ignite-dropdown-item",
      "innerTag": "igc-dropdown-item",
      "attrs": [
        "active",
        "disabled",
        "selected",
        "value"
      ],
      "events": [],
      "valueProp": "selected",
      "container": true,
      "slots": [
        "prefix",
        "",
        "suffix"
      ],
      "defaultText": "菜单项"
    },
    {
      "cmxTag": "cmx-ignite-dropdown-group",
      "innerTag": "igc-dropdown-group",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        "label",
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-dropdown-header",
      "innerTag": "igc-dropdown-header",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        ""
      ],
      "defaultText": "分组"
    },
    {
      "cmxTag": "cmx-ignite-carousel-slide",
      "innerTag": "igc-carousel-slide",
      "attrs": [
        "active",
        "previous"
      ],
      "events": [],
      "valueProp": "active",
      "container": true,
      "slots": [
        "Default"
      ]
    },
    {
      "cmxTag": "cmx-ignite-nav-drawer-item",
      "innerTag": "igc-nav-drawer-item",
      "attrs": [
        "disabled",
        "active"
      ],
      "events": [],
      "valueProp": "active",
      "container": true,
      "slots": [
        "content",
        "icon"
      ]
    },
    {
      "cmxTag": "cmx-ignite-nav-drawer-header-item",
      "innerTag": "igc-nav-drawer-header-item",
      "attrs": [],
      "events": [],
      "container": true,
      "slots": [
        ""
      ]
    },
    {
      "cmxTag": "cmx-ignite-toggle-button",
      "innerTag": "igc-toggle-button",
      "attrs": [
        "value",
        "selected",
        "disabled"
      ],
      "events": [],
      "valueProp": "selected",
      "container": true,
      "slots": [
        "Renders"
      ],
      "defaultText": "按钮"
    },
    {
      "cmxTag": "cmx-ignite-tile",
      "innerTag": "igc-tile",
      "attrs": [
        "col-span",
        "row-span",
        "col-start",
        "row-start",
        "maximized",
        "disable-resize",
        "disable-fullscreen",
        "disable-maximize",
        "position"
      ],
      "events": [
        "igcTileFullscreen",
        "igcTileMaximize",
        "igcTileDragStart",
        "igcTileDragEnd",
        "igcTileDragCancel",
        "igcTileResizeStart",
        "igcTileResizeEnd",
        "igcTileResizeCancel"
      ],
      "container": true,
      "slots": [
        "",
        "title",
        "maximize-action",
        "fullscreen-action",
        "actions",
        "side-adorner",
        "corner-adorner",
        "bottom-adorner"
      ]
    }
  ]

let _nativeRegistered = false

/** 注册全部开源 igc-* 原生元素（幂等，含主题注入）。 */
function registerNative () {
  if (_nativeRegistered) return
  _nativeRegistered = true
  ensureIgniteTheme()
  defineComponents(
    IgcAccordionComponent,
    IgcAvatarComponent,
    IgcBadgeComponent,
    IgcBannerComponent,
    IgcButtonComponent,
    IgcButtonGroupComponent,
    IgcCalendarComponent,
    IgcCardActionsComponent,
    IgcCardComponent,
    IgcCardContentComponent,
    IgcCardHeaderComponent,
    IgcCardMediaComponent,
    IgcCarouselComponent,
    IgcCarouselSlideComponent,
    IgcChatComponent,
    IgcCheckboxComponent,
    IgcChipComponent,
    IgcCircularProgressComponent,
    IgcDatePickerComponent,
    IgcDateRangePickerComponent,
    IgcDateTimeInputComponent,
    IgcDialogComponent,
    IgcDividerComponent,
    IgcDropdownComponent,
    IgcDropdownGroupComponent,
    IgcDropdownHeaderComponent,
    IgcDropdownItemComponent,
    IgcExpansionPanelComponent,
    IgcFileInputComponent,
    IgcIconButtonComponent,
    IgcIconComponent,
    IgcInputComponent,
    IgcLinearProgressComponent,
    IgcMaskInputComponent,
    IgcNavDrawerComponent,
    IgcNavDrawerHeaderItemComponent,
    IgcNavDrawerItemComponent,
    IgcNavbarComponent,
    IgcRadioComponent,
    IgcRadioGroupComponent,
    IgcRangeSliderComponent,
    IgcRatingComponent,
    IgcRatingSymbolComponent,
    IgcSelectComponent,
    IgcSelectGroupComponent,
    IgcSelectHeaderComponent,
    IgcSelectItemComponent,
    IgcSliderComponent,
    IgcSnackbarComponent,
    IgcSplitterComponent,
    IgcStepComponent,
    IgcStepperComponent,
    IgcSwitchComponent,
    IgcTabComponent,
    IgcTabsComponent,
    IgcTextareaComponent,
    IgcTileComponent,
    IgcTileManagerComponent,
    IgcToastComponent,
    IgcToggleButtonComponent,
    IgcTooltipComponent,
    IgcTreeComponent,
    IgcTreeItemComponent,
  )
}

let _thinDefined = false

/** 注册原生 igc-* + 全部 cmx-ignite-* 薄封装（幂等）。 */
export function registerCmxIgniteThin () {
  registerNative()
  if (_thinDefined) return
  _thinDefined = true
  for (const s of THIN_SPECS) {
    defineThinIgnite(s.cmxTag, s.innerTag, {
      attrs: s.attrs,
      events: s.events,
      valueProp: s.valueProp,
      container: s.container,
      slots: s.slots,
    })
  }
}

/* 模块副作用：import 即注册（barrel / 调色板插件依赖此行为）。 */
registerCmxIgniteThin()
