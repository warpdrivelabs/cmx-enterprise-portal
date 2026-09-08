import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  formatTablerUi5IconName,
  parseTablerIconName,
  prepareTablerSvgForUi5,
} from './tabler-icon-svg.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('parseTablerIconName', () => {
  assert.deepEqual(parseTablerIconName('tabler-outline/home'), {
    variant: 'outline',
    iconName: 'home',
  })
  assert.deepEqual(parseTablerIconName('tabler/filled/heart'), {
    variant: 'filled',
    iconName: 'heart',
  })
  assert.equal(parseTablerIconName('home'), null)
})

test('formatTablerUi5IconName', () => {
  assert.equal(formatTablerUi5IconName('outline', 'home'), 'tabler-outline/home')
})

test('prepareTablerSvgForUi5 outline adds stroke group and fill=none', () => {
  const svg = readFileSync(
    join(__dirname, '../icons/tabler/outline/home.svg'),
    'utf8',
  )
  const { inner } = prepareTablerSvgForUi5(svg, 'outline')
  assert.match(inner, /^<g stroke="currentColor"/)
  assert.match(inner, /fill="none"/)
  assert.doesNotMatch(inner, /M0 0h24v24H0z/)
})

test('prepareTablerSvgForUi5 filled strips bounding path only', () => {
  const svg = readFileSync(
    join(__dirname, '../icons/tabler/filled/home.svg'),
    'utf8',
  )
  const { inner } = prepareTablerSvgForUi5(svg, 'filled')
  assert.doesNotMatch(inner, /M0 0h24v24H0z/)
  assert.doesNotMatch(inner, /^<g stroke=/)
})
