interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  showAlert(message: string): void;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
  platform: string;
  colorScheme: 'light' | 'dark';
}

interface Telegram {
  WebApp: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: Telegram;
  }
}

export {};