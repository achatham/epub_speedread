import { ArrowLeft, BookOpen, Brain, Mic, Type, Library, Github } from 'lucide-react';

interface AboutContentProps {
  onSignIn?: () => void;
}

export function AboutContent({ onSignIn }: AboutContentProps) {
  return (
    <div className="max-w-2xl mx-auto px-6">
      <header className="mb-16">
        <div className="space-y-2 mb-8">
          <h1 className="text-4xl font-light leading-tight">
            Speed-read and ask an AI about your ebooks—all for free*
          </h1>
          <p className="text-[10px] opacity-40 italic leading-relaxed">
            * This app is free. While optional AI features require your own API key (typically costing only a few cents to use), this reader does not charge any fees.
          </p>
        </div>
        <p className="text-xl opacity-70 font-light">
          A minimalist EPUB reader designed for focus and comprehension.
        </p>
      </header>

      <section className="space-y-24">
        {/* RSVP Feature */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <BookOpen className="text-zinc-900 dark:text-zinc-100" />
            </div>
            <h2 className="text-2xl font-semibold">Speed Reading with RSVP</h2>
          </div>
          <p className="opacity-80 text-lg leading-relaxed">
            Rapid Serial Visual Presentation (RSVP) shows you one word at a time in the center of the screen.
            By eliminating eye movement across the page, you can dramatically increase your reading speed while maintaining deep focus.
          </p>
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-fit mx-auto">
            <img
              src="docs/Speed Reading_optimized.webp"
              alt="Speed reading demo"
              className="h-72 md:h-96 w-auto object-contain"
            />
          </div>
        </div>

        {/* AI Feature */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <Brain className="text-zinc-900 dark:text-zinc-100" />
            </div>
            <h2 className="text-2xl font-semibold">AI Assistant, No Spoilers</h2>
          </div>
          <p className="opacity-80 text-lg leading-relaxed">
            Confused by a character or just woke up from a nap? Ask the AI.
            It only sees what you've read so far, so it won't spoil what's coming next.
          </p>
          <ul className="list-disc list-inside opacity-70 space-y-2 pl-4">
            <li>"Who is this character again?"</li>
            <li>"I'm lost. What just happened?"</li>
            <li>"Summarize the story so far."</li>
          </ul>
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl max-w-fit mx-auto">
            <img
              src="docs/LLM Answer_optimized.webp"
              alt="AI Assistant demo"
              className="h-72 md:h-96 w-auto object-contain"
            />
          </div>
        </div>

        {/* Accessibility/Other Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <Type className="text-zinc-900 dark:text-zinc-100" />
              </div>
              <h3 className="text-xl font-semibold">Giant Fonts!</h3>
            </div>
            <p className="opacity-80">
              With only one word to display, the font can be much larger, making it easier to read without reading classes or while exercising.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <Mic className="text-zinc-900 dark:text-zinc-100" />
              </div>
              <h3 className="text-xl font-semibold">Listen on the go</h3>
            </div>
            <p className="opacity-80">
              Seamlessly switch between speed reading and high-quality Text-to-Speech audiobooks.
            </p>
          </div>
        </div>

        {/* DRM-Free Section */}
        <div className="pt-12 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <Library className="text-zinc-900 dark:text-zinc-100" />
            </div>
            <h2 className="text-2xl font-semibold">DRM-Free Ebooks</h2>
          </div>
          <p className="opacity-80 text-lg leading-relaxed mb-4">
            Speed Reader is designed to work with <strong>DRM-free EPUB files</strong>. 
            This means it cannot open protected books purchased from stores like Amazon or Apple Books.
          </p>
          <p className="opacity-70">
            Looking for something to read? You can download over 70,000 free, public-domain ebooks from 
            <a 
              href="https://www.gutenberg.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="ml-1.5 text-zinc-900 dark:text-zinc-100 underline underline-offset-4 hover:opacity-80 transition-opacity"
            >
              Project Gutenberg
            </a>.
          </p>
        </div>
      </section>

      {onSignIn && (
        <div className="mt-32 text-center">
          <button
            onClick={onSignIn}
            className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:opacity-90 transition-opacity shadow-lg"
          >
            Ready to start? Sign In
          </button>
        </div>
      )}

      <footer className="mt-32 pb-20 text-center border-t border-zinc-100 dark:border-zinc-800 pt-12">
        <a 
          href="https://github.com/achatham/epub_speedread" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity text-sm font-medium"
        >
          <Github size={18} />
          View on GitHub
        </a>
      </footer>
    </div>
  );
}

interface AboutViewProps {
  onBack: () => void;
  theme: 'light' | 'dark' | 'bedtime';
}

export function AboutView({ onBack, theme }: AboutViewProps) {
  const bgClass = theme === 'bedtime' ? 'bg-black' : 'bg-white dark:bg-zinc-900';
  const textClass = theme === 'bedtime' ? 'text-stone-400' : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className={`min-h-screen ${bgClass} ${textClass} p-6 pb-20`}>
      <div className="max-w-2xl mx-auto mb-12">
        <button
          onClick={onBack}
          className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft size={20} />
          Back
        </button>
      </div>
            <AboutContent />
          </div>
        );
      }
      