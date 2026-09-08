/**
 * cmx-ignite-thin-plugin — 把全部开源 Ignite 薄封装（cmx-ignite-*）注册到设计器调色板。
 *
 * 组件元数据由 packages/cmx-data-comp/scripts/gen-ignite-palette.mjs 依据 manifest 生成。
 * 自定义元素本体由 cmx-ignite-thin.js 的副作用 import 注册。
 *
 * 收费包（grids/gauges）与厚封装（combo/list/input）不在此插件，见 cmx-ignite-plugin.js / cmx-data-plugin.js。
 */
import { definePlugin } from '../lib/plugin-registry.js'

import 'cmx-data-comp/components/ignite/cmx-ignite-thin.js'

const COMPONENTS = [
    {
      "tag": "cmx-ignite-input",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-input>",
      "description": "Ignite igc-input 封装（输入框）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "type",
          "label": "type",
          "type": "text"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "inputmode",
          "label": "inputmode",
          "type": "text"
        },
        {
          "name": "pattern",
          "label": "pattern",
          "type": "text"
        },
        {
          "name": "minlength",
          "label": "minlength",
          "type": "number"
        },
        {
          "name": "maxlength",
          "label": "maxlength",
          "type": "number"
        },
        {
          "name": "min",
          "label": "min",
          "type": "number"
        },
        {
          "name": "max",
          "label": "max",
          "type": "number"
        },
        {
          "name": "step",
          "label": "step",
          "type": "number"
        },
        {
          "name": "autofocus",
          "label": "autofocus",
          "type": "boolean"
        },
        {
          "name": "autocomplete",
          "label": "autocomplete",
          "type": "text"
        },
        {
          "name": "validate-only",
          "label": "validate-only",
          "type": "boolean"
        },
        {
          "name": "readOnly",
          "label": "readOnly",
          "type": "boolean"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-input",
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-textarea",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-textarea>",
      "description": "Ignite igc-textarea 封装（多行文本）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "autocomplete",
          "label": "autocomplete",
          "type": "text"
        },
        {
          "name": "autocapitalize",
          "label": "autocapitalize",
          "type": "text"
        },
        {
          "name": "inputmode",
          "label": "inputmode",
          "type": "text"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        },
        {
          "name": "maxlength",
          "label": "maxlength",
          "type": "number"
        },
        {
          "name": "minlength",
          "label": "minlength",
          "type": "number"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "resize",
          "label": "resize",
          "type": "text"
        },
        {
          "name": "rows",
          "label": "rows",
          "type": "number"
        },
        {
          "name": "spellcheck",
          "label": "spellcheck",
          "type": "boolean"
        },
        {
          "name": "wrap",
          "label": "wrap",
          "type": "select",
          "options": [
            "hard",
            "soft",
            "off"
          ]
        },
        {
          "name": "validate-only",
          "label": "validate-only",
          "type": "boolean"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-input",
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-mask-input",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-mask-input>",
      "description": "Ignite igc-mask-input 封装（掩码输入）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "value-mode",
          "label": "value-mode",
          "type": "text"
        },
        {
          "name": "mask",
          "label": "mask",
          "type": "text"
        },
        {
          "name": "prompt",
          "label": "prompt",
          "type": "text"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "readOnly",
          "label": "readOnly",
          "type": "boolean"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-input",
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-date-time-input",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-date-time-input>",
      "description": "Ignite igc-date-time-input 封装（日期时间输入）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "input-format",
          "label": "input-format",
          "type": "text"
        },
        {
          "name": "min",
          "label": "min",
          "type": "text"
        },
        {
          "name": "max",
          "label": "max",
          "type": "text"
        },
        {
          "name": "display-format",
          "label": "display-format",
          "type": "text"
        },
        {
          "name": "spin-loop",
          "label": "spin-loop",
          "type": "boolean"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "mask",
          "label": "mask",
          "type": "text"
        },
        {
          "name": "prompt",
          "label": "prompt",
          "type": "text"
        },
        {
          "name": "readOnly",
          "label": "readOnly",
          "type": "boolean"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-input",
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-file-input",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-file-input>",
      "description": "Ignite igc-file-input 封装（文件输入）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "multiple",
          "label": "multiple",
          "type": "boolean"
        },
        {
          "name": "accept",
          "label": "accept",
          "type": "text"
        },
        {
          "name": "autofocus",
          "label": "autofocus",
          "type": "boolean"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change",
        "cmx-cancel"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-checkbox",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-checkbox>",
      "description": "Ignite igc-checkbox 封装（复选框）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "indeterminate",
          "label": "indeterminate",
          "type": "boolean"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "label-position",
          "label": "label-position",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-switch",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-switch>",
      "description": "Ignite igc-switch 封装（开关）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "label-position",
          "label": "label-position",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-radio-group",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-radio-group>",
      "description": "Ignite igc-radio-group 封装（单选组）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "alignment",
          "label": "alignment",
          "type": "text"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-select",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-select>",
      "description": "Ignite igc-select 封装（下拉选择）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "autofocus",
          "label": "autofocus",
          "type": "boolean"
        },
        {
          "name": "distance",
          "label": "distance",
          "type": "number"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "placement",
          "label": "placement",
          "type": "text"
        },
        {
          "name": "scroll-strategy",
          "label": "scroll-strategy",
          "type": "text"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-select",
          "label": "keep-open-on-select",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-outside-click",
          "label": "keep-open-on-outside-click",
          "type": "boolean"
        },
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change",
        "cmx-opening",
        "cmx-opened",
        "cmx-closing",
        "cmx-closed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-slider",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-slider>",
      "description": "Ignite igc-slider 封装（滑块）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "min",
          "label": "min",
          "type": "number"
        },
        {
          "name": "max",
          "label": "max",
          "type": "number"
        },
        {
          "name": "lower-bound",
          "label": "lower-bound",
          "type": "number"
        },
        {
          "name": "upper-bound",
          "label": "upper-bound",
          "type": "number"
        },
        {
          "name": "discrete-track",
          "label": "discrete-track",
          "type": "boolean"
        },
        {
          "name": "hide-tooltip",
          "label": "hide-tooltip",
          "type": "boolean"
        },
        {
          "name": "step",
          "label": "step",
          "type": "number"
        },
        {
          "name": "primary-ticks",
          "label": "primary-ticks",
          "type": "number"
        },
        {
          "name": "secondary-ticks",
          "label": "secondary-ticks",
          "type": "number"
        },
        {
          "name": "tick-orientation",
          "label": "tick-orientation",
          "type": "text"
        },
        {
          "name": "hide-primary-labels",
          "label": "hide-primary-labels",
          "type": "boolean"
        },
        {
          "name": "hide-secondary-labels",
          "label": "hide-secondary-labels",
          "type": "boolean"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "value-format",
          "label": "value-format",
          "type": "text"
        },
        {
          "name": "tick-label-rotation",
          "label": "tick-label-rotation",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-input",
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-range-slider",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-range-slider>",
      "description": "Ignite igc-range-slider 封装（范围滑块）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "lower",
          "label": "lower",
          "type": "number"
        },
        {
          "name": "upper",
          "label": "upper",
          "type": "number"
        },
        {
          "name": "thumb-label-lower",
          "label": "thumb-label-lower",
          "type": "text"
        },
        {
          "name": "thumb-label-upper",
          "label": "thumb-label-upper",
          "type": "text"
        },
        {
          "name": "min",
          "label": "min",
          "type": "number"
        },
        {
          "name": "max",
          "label": "max",
          "type": "number"
        },
        {
          "name": "lower-bound",
          "label": "lower-bound",
          "type": "number"
        },
        {
          "name": "upper-bound",
          "label": "upper-bound",
          "type": "number"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "discrete-track",
          "label": "discrete-track",
          "type": "boolean"
        },
        {
          "name": "hide-tooltip",
          "label": "hide-tooltip",
          "type": "boolean"
        },
        {
          "name": "step",
          "label": "step",
          "type": "number"
        },
        {
          "name": "primary-ticks",
          "label": "primary-ticks",
          "type": "number"
        },
        {
          "name": "secondary-ticks",
          "label": "secondary-ticks",
          "type": "number"
        },
        {
          "name": "tick-orientation",
          "label": "tick-orientation",
          "type": "text"
        },
        {
          "name": "hide-primary-labels",
          "label": "hide-primary-labels",
          "type": "boolean"
        },
        {
          "name": "hide-secondary-labels",
          "label": "hide-secondary-labels",
          "type": "boolean"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "value-format",
          "label": "value-format",
          "type": "text"
        },
        {
          "name": "tick-label-rotation",
          "label": "tick-label-rotation",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-input",
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-rating",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-rating>",
      "description": "Ignite igc-rating 封装（评分）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "max",
          "label": "max",
          "type": "number"
        },
        {
          "name": "step",
          "label": "step",
          "type": "number"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        },
        {
          "name": "value-format",
          "label": "value-format",
          "type": "text"
        },
        {
          "name": "hover-preview",
          "label": "hover-preview",
          "type": "boolean"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "single",
          "label": "single",
          "type": "boolean"
        },
        {
          "name": "allow-reset",
          "label": "allow-reset",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change",
        "cmx-hover"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-calendar",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-calendar>",
      "description": "Ignite igc-calendar 封装（日历）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "hide-outside-days",
          "label": "hide-outside-days",
          "type": "boolean"
        },
        {
          "name": "hide-header",
          "label": "hide-header",
          "type": "boolean"
        },
        {
          "name": "header-orientation",
          "label": "header-orientation",
          "type": "text"
        },
        {
          "name": "orientation",
          "label": "orientation",
          "type": "text"
        },
        {
          "name": "visible-months",
          "label": "visible-months",
          "type": "number"
        },
        {
          "name": "active-view",
          "label": "active-view",
          "type": "text"
        },
        {
          "name": "values",
          "label": "values",
          "type": "text"
        },
        {
          "name": "selection",
          "label": "selection",
          "type": "text"
        },
        {
          "name": "show-week-numbers",
          "label": "show-week-numbers",
          "type": "boolean"
        },
        {
          "name": "week-start",
          "label": "week-start",
          "type": "text"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "active-date",
          "label": "active-date",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-date-picker",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-date-picker>",
      "description": "Ignite igc-date-picker 封装（日期选择）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        },
        {
          "name": "mode",
          "label": "mode",
          "type": "text"
        },
        {
          "name": "non-editable",
          "label": "non-editable",
          "type": "boolean"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "min",
          "label": "min",
          "type": "text"
        },
        {
          "name": "max",
          "label": "max",
          "type": "text"
        },
        {
          "name": "header-orientation",
          "label": "header-orientation",
          "type": "text"
        },
        {
          "name": "orientation",
          "label": "orientation",
          "type": "text"
        },
        {
          "name": "hide-header",
          "label": "hide-header",
          "type": "boolean"
        },
        {
          "name": "hide-outside-days",
          "label": "hide-outside-days",
          "type": "boolean"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "visible-months",
          "label": "visible-months",
          "type": "number"
        },
        {
          "name": "show-week-numbers",
          "label": "show-week-numbers",
          "type": "boolean"
        },
        {
          "name": "display-format",
          "label": "display-format",
          "type": "text"
        },
        {
          "name": "input-format",
          "label": "input-format",
          "type": "text"
        },
        {
          "name": "prompt",
          "label": "prompt",
          "type": "text"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "active-date",
          "label": "active-date",
          "type": "text"
        },
        {
          "name": "week-start",
          "label": "week-start",
          "type": "text"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-select",
          "label": "keep-open-on-select",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-outside-click",
          "label": "keep-open-on-outside-click",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-opening",
        "cmx-opened",
        "cmx-closing",
        "cmx-closed",
        "cmx-change",
        "cmx-input"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-date-range-picker",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-date-range-picker>",
      "description": "Ignite igc-date-range-picker 封装（日期范围选择）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "mode",
          "label": "mode",
          "type": "text"
        },
        {
          "name": "use-two-inputs",
          "label": "use-two-inputs",
          "type": "boolean"
        },
        {
          "name": "usePredefinedRanges",
          "label": "usePredefinedRanges",
          "type": "boolean"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        },
        {
          "name": "readonly",
          "label": "readonly",
          "type": "boolean"
        },
        {
          "name": "non-editable",
          "label": "non-editable",
          "type": "boolean"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "label",
          "label": "label",
          "type": "text"
        },
        {
          "name": "label-start",
          "label": "label-start",
          "type": "text"
        },
        {
          "name": "label-end",
          "label": "label-end",
          "type": "text"
        },
        {
          "name": "placeholder",
          "label": "placeholder",
          "type": "text"
        },
        {
          "name": "placeholder-start",
          "label": "placeholder-start",
          "type": "text"
        },
        {
          "name": "placeholder-end",
          "label": "placeholder-end",
          "type": "text"
        },
        {
          "name": "prompt",
          "label": "prompt",
          "type": "text"
        },
        {
          "name": "display-format",
          "label": "display-format",
          "type": "text"
        },
        {
          "name": "input-format",
          "label": "input-format",
          "type": "text"
        },
        {
          "name": "min",
          "label": "min",
          "type": "text"
        },
        {
          "name": "max",
          "label": "max",
          "type": "text"
        },
        {
          "name": "visible-months",
          "label": "visible-months",
          "type": "number"
        },
        {
          "name": "header-orientation",
          "label": "header-orientation",
          "type": "text"
        },
        {
          "name": "orientation",
          "label": "orientation",
          "type": "text"
        },
        {
          "name": "hide-header",
          "label": "hide-header",
          "type": "boolean"
        },
        {
          "name": "show-week-numbers",
          "label": "show-week-numbers",
          "type": "boolean"
        },
        {
          "name": "hide-outside-days",
          "label": "hide-outside-days",
          "type": "boolean"
        },
        {
          "name": "use-predefined-ranges",
          "label": "use-predefined-ranges",
          "type": "boolean"
        },
        {
          "name": "active-date",
          "label": "active-date",
          "type": "text"
        },
        {
          "name": "week-start",
          "label": "week-start",
          "type": "text"
        },
        {
          "name": "required",
          "label": "required",
          "type": "boolean"
        },
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "invalid",
          "label": "invalid",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-select",
          "label": "keep-open-on-select",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-outside-click",
          "label": "keep-open-on-outside-click",
          "type": "boolean"
        },
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-opening",
        "cmx-opened",
        "cmx-closing",
        "cmx-closed",
        "cmx-change",
        "cmx-input"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-card",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-card>",
      "description": "Ignite igc-card 封装（卡片）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "elevated",
          "label": "elevated",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-accordion",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-accordion>",
      "description": "Ignite igc-accordion 封装（手风琴）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "single-expand",
          "label": "single-expand",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-expansion-panel",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-expansion-panel>",
      "description": "Ignite igc-expansion-panel 封装（展开面板）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "indicator-position",
          "label": "indicator-position",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-opening",
        "cmx-opened",
        "cmx-closing",
        "cmx-closed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-tabs",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-tabs>",
      "description": "Ignite igc-tabs 封装（标签页）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "alignment",
          "label": "alignment",
          "type": "text"
        },
        {
          "name": "activation",
          "label": "activation",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-stepper",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-stepper>",
      "description": "Ignite igc-stepper 封装（步骤器）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "orientation",
          "label": "orientation",
          "type": "text"
        },
        {
          "name": "step-type",
          "label": "step-type",
          "type": "text"
        },
        {
          "name": "linear",
          "label": "linear",
          "type": "boolean"
        },
        {
          "name": "content-top",
          "label": "content-top",
          "type": "boolean"
        },
        {
          "name": "vertical-animation",
          "label": "vertical-animation",
          "type": "text"
        },
        {
          "name": "horizontal-animation",
          "label": "horizontal-animation",
          "type": "text"
        },
        {
          "name": "animation-duration",
          "label": "animation-duration",
          "type": "number"
        },
        {
          "name": "title-position",
          "label": "title-position",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-active-step-changing",
        "cmx-active-step-changed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-tree",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-tree>",
      "description": "Ignite igc-tree 封装（树）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "single-branch-expand",
          "label": "single-branch-expand",
          "type": "boolean"
        },
        {
          "name": "toggle-node-on-click",
          "label": "toggle-node-on-click",
          "type": "boolean"
        },
        {
          "name": "selection",
          "label": "selection",
          "type": "text"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-selection",
        "cmx-item-collapsed",
        "cmx-item-collapsing",
        "cmx-item-expanded",
        "cmx-item-expanding",
        "cmx-active-item"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-dropdown",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-dropdown>",
      "description": "Ignite igc-dropdown 封装（下拉菜单）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "placement",
          "label": "placement",
          "type": "text"
        },
        {
          "name": "scroll-strategy",
          "label": "scroll-strategy",
          "type": "text"
        },
        {
          "name": "flip",
          "label": "flip",
          "type": "boolean"
        },
        {
          "name": "distance",
          "label": "distance",
          "type": "number"
        },
        {
          "name": "same-width",
          "label": "same-width",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-select",
          "label": "keep-open-on-select",
          "type": "boolean"
        },
        {
          "name": "keep-open-on-outside-click",
          "label": "keep-open-on-outside-click",
          "type": "boolean"
        },
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-change",
        "cmx-opening",
        "cmx-opened",
        "cmx-closing",
        "cmx-closed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-carousel",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-carousel>",
      "description": "Ignite igc-carousel 封装（轮播）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "disable-loop",
          "label": "disable-loop",
          "type": "boolean"
        },
        {
          "name": "disable-pause-on-interaction",
          "label": "disable-pause-on-interaction",
          "type": "boolean"
        },
        {
          "name": "hide-navigation",
          "label": "hide-navigation",
          "type": "boolean"
        },
        {
          "name": "hide-indicators",
          "label": "hide-indicators",
          "type": "boolean"
        },
        {
          "name": "vertical",
          "label": "vertical",
          "type": "boolean"
        },
        {
          "name": "indicators-orientation",
          "label": "indicators-orientation",
          "type": "text"
        },
        {
          "name": "indicators-label-format",
          "label": "indicators-label-format",
          "type": "text"
        },
        {
          "name": "slides-label-format",
          "label": "slides-label-format",
          "type": "text"
        },
        {
          "name": "interval",
          "label": "interval",
          "type": "number"
        },
        {
          "name": "maximum-indicators-count",
          "label": "maximum-indicators-count",
          "type": "number"
        },
        {
          "name": "animation-type",
          "label": "animation-type",
          "type": "text"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-slide-changed",
        "cmx-playing",
        "cmx-paused"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-nav-drawer",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-nav-drawer>",
      "description": "Ignite igc-nav-drawer 封装（导航抽屉）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "position",
          "label": "position",
          "type": "text"
        },
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-navbar",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-navbar>",
      "description": "Ignite igc-navbar 封装（导航栏）",
      "canNest": true,
      "isVoid": false,
      "attrs": [],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-button-group",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-button-group>",
      "description": "Ignite igc-button-group 封装（按钮组）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "alignment",
          "label": "alignment",
          "type": "text"
        },
        {
          "name": "selection",
          "label": "selection",
          "type": "text"
        },
        {
          "name": "selectedItems",
          "label": "selectedItems",
          "type": "text"
        },
        {
          "name": "selected-items",
          "label": "selected-items",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-select",
        "cmx-deselect"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-dialog",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-dialog>",
      "description": "Ignite igc-dialog 封装（对话框）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "keep-open-on-escape",
          "label": "keep-open-on-escape",
          "type": "boolean"
        },
        {
          "name": "close-on-outside-click",
          "label": "close-on-outside-click",
          "type": "boolean"
        },
        {
          "name": "hide-default-action",
          "label": "hide-default-action",
          "type": "boolean"
        },
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        },
        {
          "name": "title",
          "label": "title",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-closing",
        "cmx-closed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-splitter",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-splitter>",
      "description": "Ignite igc-splitter 封装（分隔面板）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "orientation",
          "label": "orientation",
          "type": "text"
        },
        {
          "name": "disable-collapse",
          "label": "disable-collapse",
          "type": "boolean"
        },
        {
          "name": "disable-resize",
          "label": "disable-resize",
          "type": "boolean"
        },
        {
          "name": "hide-collapse-buttons",
          "label": "hide-collapse-buttons",
          "type": "boolean"
        },
        {
          "name": "hide-drag-handle",
          "label": "hide-drag-handle",
          "type": "boolean"
        },
        {
          "name": "start-min-size",
          "label": "start-min-size",
          "type": "text"
        },
        {
          "name": "end-min-size",
          "label": "end-min-size",
          "type": "text"
        },
        {
          "name": "start-max-size",
          "label": "start-max-size",
          "type": "text"
        },
        {
          "name": "end-max-size",
          "label": "end-max-size",
          "type": "text"
        },
        {
          "name": "start-size",
          "label": "start-size",
          "type": "text"
        },
        {
          "name": "end-size",
          "label": "end-size",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-resize-start",
        "cmx-resizing",
        "cmx-resize-end"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-tile-manager",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-tile-manager>",
      "description": "Ignite igc-tile-manager 封装（磁贴管理）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "resize-mode",
          "label": "resize-mode",
          "type": "text"
        },
        {
          "name": "drag-mode",
          "label": "drag-mode",
          "type": "text"
        },
        {
          "name": "column-count",
          "label": "column-count",
          "type": "number"
        },
        {
          "name": "min-column-width",
          "label": "min-column-width",
          "type": "text"
        },
        {
          "name": "min-row-height",
          "label": "min-row-height",
          "type": "text"
        },
        {
          "name": "gap",
          "label": "gap",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-chat",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-chat>",
      "description": "Ignite igc-chat 封装（聊天）",
      "canNest": true,
      "isVoid": false,
      "attrs": [],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-message-created",
        "cmx-message-react",
        "cmx-attachment-click",
        "cmx-attachment-added",
        "cmx-attachment-removed",
        "cmx-attachment-drag",
        "cmx-attachment-drop",
        "cmx-typing-change",
        "cmx-input-focus",
        "cmx-input-blur",
        "cmx-input-change"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-button",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-button>",
      "description": "Ignite igc-button 封装（按钮）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "variant",
          "label": "variant",
          "type": "text"
        },
        {
          "name": "type",
          "label": "type",
          "type": "select",
          "options": [
            "button",
            "reset",
            "submit"
          ]
        },
        {
          "name": "href",
          "label": "href",
          "type": "text"
        },
        {
          "name": "download",
          "label": "download",
          "type": "text"
        },
        {
          "name": "target",
          "label": "target",
          "type": "select",
          "options": [
            "_blank",
            "_parent",
            "_self",
            "_top"
          ]
        },
        {
          "name": "rel",
          "label": "rel",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        },
        "text": "按钮"
      }
    },
    {
      "tag": "cmx-ignite-icon-button",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-icon-button>",
      "description": "Ignite igc-icon-button 封装（图标按钮）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "collection",
          "label": "collection",
          "type": "text"
        },
        {
          "name": "mirrored",
          "label": "mirrored",
          "type": "boolean"
        },
        {
          "name": "variant",
          "label": "variant",
          "type": "text"
        },
        {
          "name": "type",
          "label": "type",
          "type": "select",
          "options": [
            "button",
            "reset",
            "submit"
          ]
        },
        {
          "name": "href",
          "label": "href",
          "type": "text"
        },
        {
          "name": "download",
          "label": "download",
          "type": "text"
        },
        {
          "name": "target",
          "label": "target",
          "type": "select",
          "options": [
            "_blank",
            "_parent",
            "_self",
            "_top"
          ]
        },
        {
          "name": "rel",
          "label": "rel",
          "type": "text"
        },
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-icon",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-icon>",
      "description": "Ignite igc-icon 封装（图标）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "name",
          "label": "name",
          "type": "text"
        },
        {
          "name": "collection",
          "label": "collection",
          "type": "text"
        },
        {
          "name": "mirrored",
          "label": "mirrored",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-avatar",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-avatar>",
      "description": "Ignite igc-avatar 封装（头像）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "src",
          "label": "src",
          "type": "text"
        },
        {
          "name": "alt",
          "label": "alt",
          "type": "text"
        },
        {
          "name": "initials",
          "label": "initials",
          "type": "text"
        },
        {
          "name": "shape",
          "label": "shape",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-badge",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-badge>",
      "description": "Ignite igc-badge 封装（徽标）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "variant",
          "label": "variant",
          "type": "text"
        },
        {
          "name": "outlined",
          "label": "outlined",
          "type": "boolean"
        },
        {
          "name": "shape",
          "label": "shape",
          "type": "text"
        },
        {
          "name": "dot",
          "label": "dot",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        },
        "text": "1"
      }
    },
    {
      "tag": "cmx-ignite-chip",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-chip>",
      "description": "Ignite igc-chip 封装（标签片）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "disabled",
          "label": "disabled",
          "type": "boolean"
        },
        {
          "name": "removable",
          "label": "removable",
          "type": "boolean"
        },
        {
          "name": "selectable",
          "label": "selectable",
          "type": "boolean"
        },
        {
          "name": "variant",
          "label": "variant",
          "type": "text"
        },
        {
          "name": "locale",
          "label": "locale",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-remove",
        "cmx-select"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        },
        "text": "Chip"
      }
    },
    {
      "tag": "cmx-ignite-divider",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-divider>",
      "description": "Ignite igc-divider 封装（分隔线）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "vertical",
          "label": "vertical",
          "type": "boolean"
        },
        {
          "name": "middle",
          "label": "middle",
          "type": "boolean"
        },
        {
          "name": "type",
          "label": "type",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-banner",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-banner>",
      "description": "Ignite igc-banner 封装（横幅）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-closing",
        "cmx-closed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        },
        "text": "横幅内容"
      }
    },
    {
      "tag": "cmx-ignite-snackbar",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-snackbar>",
      "description": "Ignite igc-snackbar 封装（消息条）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "action-text",
          "label": "action-text",
          "type": "text"
        },
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        },
        {
          "name": "display-time",
          "label": "display-time",
          "type": "number"
        },
        {
          "name": "keep-open",
          "label": "keep-open",
          "type": "boolean"
        },
        {
          "name": "position",
          "label": "position",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-action"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        },
        "text": "消息"
      }
    },
    {
      "tag": "cmx-ignite-toast",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-toast>",
      "description": "Ignite igc-toast 封装（轻提示）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        },
        {
          "name": "display-time",
          "label": "display-time",
          "type": "number"
        },
        {
          "name": "keep-open",
          "label": "keep-open",
          "type": "boolean"
        },
        {
          "name": "position",
          "label": "position",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        },
        "text": "提示"
      }
    },
    {
      "tag": "cmx-ignite-tooltip",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-tooltip>",
      "description": "Ignite igc-tooltip 封装（工具提示）",
      "canNest": true,
      "isVoid": false,
      "attrs": [
        {
          "name": "open",
          "label": "open",
          "type": "boolean"
        },
        {
          "name": "with-arrow",
          "label": "with-arrow",
          "type": "boolean"
        },
        {
          "name": "offset",
          "label": "offset",
          "type": "number"
        },
        {
          "name": "placement",
          "label": "placement",
          "type": "text"
        },
        {
          "name": "anchor",
          "label": "anchor",
          "type": "text"
        },
        {
          "name": "show-triggers",
          "label": "show-triggers",
          "type": "text"
        },
        {
          "name": "hide-triggers",
          "label": "hide-triggers",
          "type": "text"
        },
        {
          "name": "show-delay",
          "label": "show-delay",
          "type": "number"
        },
        {
          "name": "hide-delay",
          "label": "hide-delay",
          "type": "number"
        },
        {
          "name": "message",
          "label": "message",
          "type": "text"
        },
        {
          "name": "sticky",
          "label": "sticky",
          "type": "boolean"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "extraEvents": [
        "cmx-opening",
        "cmx-opened",
        "cmx-closing",
        "cmx-closed"
      ],
      "defaults": {
        "attributes": {
          "style": "display:block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-linear-progress",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-linear-progress>",
      "description": "Ignite igc-linear-progress 封装（线性进度）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "striped",
          "label": "striped",
          "type": "boolean"
        },
        {
          "name": "label-align",
          "label": "label-align",
          "type": "text"
        },
        {
          "name": "max",
          "label": "max",
          "type": "number"
        },
        {
          "name": "variant",
          "label": "variant",
          "type": "text"
        },
        {
          "name": "animation-duration",
          "label": "animation-duration",
          "type": "number"
        },
        {
          "name": "indeterminate",
          "label": "indeterminate",
          "type": "boolean"
        },
        {
          "name": "hide-label",
          "label": "hide-label",
          "type": "boolean"
        },
        {
          "name": "label-format",
          "label": "label-format",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    },
    {
      "tag": "cmx-ignite-circular-progress",
      "group": "cmx-ignite-thin",
      "label": "<cmx-ignite-circular-progress>",
      "description": "Ignite igc-circular-progress 封装（环形进度）",
      "canNest": false,
      "isVoid": true,
      "attrs": [
        {
          "name": "max",
          "label": "max",
          "type": "number"
        },
        {
          "name": "variant",
          "label": "variant",
          "type": "text"
        },
        {
          "name": "animation-duration",
          "label": "animation-duration",
          "type": "number"
        },
        {
          "name": "indeterminate",
          "label": "indeterminate",
          "type": "boolean"
        },
        {
          "name": "hide-label",
          "label": "hide-label",
          "type": "boolean"
        },
        {
          "name": "label-format",
          "label": "label-format",
          "type": "text"
        }
      ],
      "styleGroups": [
        "layout",
        "flex",
        "box",
        "position"
      ],
      "defaults": {
        "attributes": {
          "style": "display:inline-block;"
        }
      }
    }
  ]

definePlugin({
  id: 'cmx-ignite-thin',
  groups: [{ id: 'cmx-ignite-thin', label: 'Ignite 全组件', icon: 'flame', order: 1.6, collapsed: true }],
  components: COMPONENTS,
})
