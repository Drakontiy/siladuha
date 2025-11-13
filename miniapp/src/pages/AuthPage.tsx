import React, { useEffect, useState } from 'react';
import './AuthPage.css';

interface AuthPageProps {
  onCodeGenerated: (code: string) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onCodeGenerated }) => {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const generateCode = async () => {
      try {
        const apiBase = process.env.MINIAPP_API_BASE || window.location.origin;
        const response = await fetch(`${apiBase}/api/auth/generate-code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Не удалось сгенерировать код');
        }

        const data = await response.json();
        
        // Анимация появления символов
        setIsAnimating(true);
        const codeArray = data.code.split('');
        let displayedCode = '';
        
        const animateCode = () => {
          if (displayedCode.length < codeArray.length) {
            displayedCode += codeArray[displayedCode.length];
            setCode(displayedCode);
            setTimeout(animateCode, 50);
          } else {
            setIsAnimating(false);
            setCode(data.code);
            onCodeGenerated(data.code);
          }
        };
        
        animateCode();
      } catch (err) {
        setError('Ошибка при генерации кода. Попробуйте обновить страницу.');
        console.error('Failed to generate code:', err);
      }
    };

    generateCode();
  }, [onCodeGenerated]);

  const handleCopy = async () => {
    if (!code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setIsAnimating(false); // Останавливаем анимацию после копирования
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setError('Не удалось скопировать код');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-illustration">
          <img src="media/happy1.svg" alt="Добро пожаловать" className="auth-image" />
        </div>
        
        <div className="auth-content">
          <h2 className="auth-title">Привязка аккаунта</h2>
          <p className="auth-message">
            Пожалуйста скопируйте данный код и отправьте его в чат с нашим ботом в Макс. Не передавайте его никому
          </p>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          {code ? (
            <div className="auth-code-section">
              <div className={`auth-code-display ${isAnimating ? 'auth-code-animating' : ''}`}>
                {code}
              </div>
              <button 
                className="auth-copy-button" 
                onClick={handleCopy}
                disabled={copied}
              >
                {copied ? '✓ Скопировано' : 'Скопировать'}
              </button>
            </div>
          ) : (
            <div className="auth-loading">
              Генерация кода...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

