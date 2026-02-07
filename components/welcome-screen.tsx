"use client"

function LeafIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </svg>
  )
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  )
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  )
}

const suggestions = [
  {
    icon: SparklesIcon,
    label: "Explain a concept",
    prompt: "Explain quantum computing in simple terms",
  },
  {
    icon: CodeIcon,
    label: "Help me code",
    prompt: "Write a Python function that sorts a list using merge sort",
  },
  {
    icon: PenIcon,
    label: "Draft content",
    prompt: "Draft a professional email to schedule a meeting",
  },
  {
    icon: LightbulbIcon,
    label: "Brainstorm ideas",
    prompt: "Give me 5 creative project ideas for learning web development",
  },
]

interface WelcomeScreenProps {
  onSuggestionClick: (prompt: string) => void
}

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
          <LeafIcon className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground">
            Welcome to Verdant
          </h1>
          <p className="max-w-md text-pretty text-muted-foreground leading-relaxed">
            Your eco-conscious AI assistant. Ask questions, generate ideas, write code, or explore any topic.
          </p>
        </div>
        <div className="mt-4 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              onClick={() => onSuggestionClick(suggestion.prompt)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-primary/10">
                <suggestion.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">
                {suggestion.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
