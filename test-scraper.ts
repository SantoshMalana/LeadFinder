import { scrapeAllSubreddits } from './scrapers/reddit'

const MY_KEYWORDS = [
  'need react dev',
  'hire full stack',
  'looking for developer',
  'need a website',
  'node.js developer',
  'react developer',
  'next.js',
  'full stack developer',
  'need freelancer',
  'build my app',
]

const MY_SUBREDDITS = ['forhire', 'slavelabour', 'startups']

async function test() {
  console.log('🚀 Starting scraper test...\n')
  const posts = await scrapeAllSubreddits(MY_SUBREDDITS, MY_KEYWORDS)
  console.log('\n📋 Sample results:')
  posts.slice(0, 5).forEach((p, i) => {
    console.log(`\n[${i + 1}] ${p.post_title}`)
    console.log(`    👤 u/${p.author}`)
    console.log(`    🔗 ${p.post_url}`)
  })
}

test()
