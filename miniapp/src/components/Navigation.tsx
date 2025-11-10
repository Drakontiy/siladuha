import React from 'react';
import './Navigation.css';

type Page = 'home' | 'stats' | 'time' | 'people' | 'subjects';

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate }) => {
  const icons = [
    { id: 'home' as Page, svg: '1.svg', alt: 'Дом' },
    { id: 'stats' as Page, svg: '2.svg', alt: 'Статистика' },
    { id: 'time' as Page, svg: '3.svg', alt: 'Время' },
    { id: 'people' as Page, svg: '4.svg', alt: 'Люди' },
    { id: 'subjects' as Page, svg: '5.svg', alt: 'Предметы' },
  ];

  return (
    <nav className="navigation">
      {icons.map((icon) => (
        <button
          key={icon.id}
          className={`nav-icon ${currentPage === icon.id ? 'active' : ''}`}
          onClick={() => onNavigate(icon.id)}
          aria-label={icon.alt}
        >
          <img
            src={`media/${icon.svg}`}
            alt={icon.alt}
            className="nav-icon-img"
          />
        </button>
      ))}
    </nav>
  );
};

export default Navigation;

