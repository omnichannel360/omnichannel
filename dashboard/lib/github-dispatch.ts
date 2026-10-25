const GITHUB_API = 'https://api.github.com'
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/
const TITLE_MAX = 80

export type DispatchResult =
  | { status: 'created'; number: number; url: string; repo: string }
  | { status: 'not_configured' }
  | { status: 'failed'; reason: string }

export function isDispatchConfigured(): boolean {
  return Boolean(process.env.AGENT_GITHUB_TOKEN && REPO_PATTERN.test(process.env.AGENT_GITHUB_REPO || ''))
}

function issueTitle(message: string): string {
  const firstLine = message.trim().split('\n')[0]
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine
}

/**
 * Turns a dashboard dispatch into a GitHub issue labelled `agent`,
 * which starts the engineer agent workflow in that repository.
 */
export async function dispatchToGitHub(message: string, requester: string): Promise<DispatchResult> {
  const token = process.env.AGENT_GITHUB_TOKEN
  const repo = process.env.AGENT_GITHUB_REPO || ''
  if (!token || !REPO_PATTERN.test(repo)) return { status: 'not_configured' }

  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: issueTitle(message),
        body: `${message.trim()}\n\n---\nDispatched from the OmniForge dashboard by ${requester || 'unknown user'}.`,
        labels: ['agent'],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { status: 'failed', reason: `GitHub responded ${res.status}` }
    const issue = (await res.json()) as { number: number; html_url: string }
    return { status: 'created', number: issue.number, url: issue.html_url, repo }
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'network error' }
  }
}
