import type { Register } from 'claude-code'

const STEPS = [75, 50]

const stepFor = (percent: number | null | undefined) =>
  STEPS.find(s => (percent ?? 0) >= s) ?? 0

export const register: Register = on => {
  let toasted = 0

  on('turn.complete', async ($, e, next) => {
    const step = stepFor((await $.session.usage()).context.percent)
    if (step > toasted) {
      $.ui.toast(`Context ${step}% full: save state, then compact`)
    }
    toasted = step

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const step = stepFor((await $.session.usage()).context.percent)
    if (e.props.hasSurvey || step === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          Context {step}%+ full. Run /save-state, then /compact.
        </Text>
      </Box>
    )
  })
}
