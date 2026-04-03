import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { scrapeJob } from '@/inngest/scrapeJob'
import { scoreJob } from '@/inngest/scoreJob'
import { alertJob } from '@/inngest/alertJob'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scrapeJob, scoreJob, alertJob],
})
