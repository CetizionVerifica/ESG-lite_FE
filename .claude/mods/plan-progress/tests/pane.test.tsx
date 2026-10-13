import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'plan-progress',
  component: 'Pane',
  requestId: 'plan-progress',
  props: { title: 'Plan progress', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 } },
} as const

test('the pane draws a header and a Refresh button, and says when GitHub refuses', async ($, on) => {
  mock.env(on, {})
  on('http.fetch', () => ({ value: { status: 404, ok: false, headers: {}, text: '{"message":"Not Found"}' } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^Plan progress/ })).toBeDefined()
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Text', text: /GitHub answered 404/ })).toBeDefined()
    await ui.unmount()
  }
})
