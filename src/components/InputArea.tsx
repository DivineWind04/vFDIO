import React, { useEffect, useRef, useState } from 'react';

const CommandInput = ({ isProcessing = false }: { isProcessing?: boolean }) => {
  const terminalInputRef = useRef<HTMLDivElement>(null);
  const [typedCommand, setTypedCommand] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const focus = () => terminalInputRef.current?.focus();
    focus();

    const interval = setInterval(() => {
      if (document.activeElement !== terminalInputRef.current) {
        focus();
      }
    }, 500);

    const blink = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 250);

    return () => {
      clearInterval(interval);
      clearInterval(blink);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (e.key === 'Enter') {
      if (typedCommand.trim() !== '') {
        console.log('Executing command:', typedCommand);
        // Do something here (API call, parsing, etc.)
      }
      setTypedCommand('');
    } else if (e.key === 'Escape') {
      setTypedCommand('');
    } else if (e.key === 'Backspace') {
      setTypedCommand((prev) => prev.slice(0, -1));
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setTypedCommand((prev) => prev + e.key.toUpperCase());
    }
  };

  return (
    <div className="command-section text-fdio-green text-lg bg-black p-2 w-[960px]">
      <div
        className="terminal-input-area flex items-center outline-none"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        ref={terminalInputRef}
      >
        <span className="command-prompt mr-1">&gt;</span>
        <span className="typed-command whitespace-pre">{typedCommand}</span>
        <span
          className={`ml-0.5 w-[0.75rem] h-[1.5rem] bg-fdio-green ${
            cursorVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {isProcessing && (
        <div className="processing-status mt-2">
          PROCESSING<span className="processing-dots">...</span>
        </div>
      )}
    </div>
  );
};

export default CommandInput;
