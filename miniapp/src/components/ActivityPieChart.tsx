import React, { useMemo } from 'react';
import './ActivityPieChart.css';
import { ACTIVITY_COLORS, ACTIVITY_NAMES } from '../types';

interface ActivityPieChartEntry {
  type: keyof typeof ACTIVITY_COLORS;
  minutes: number;
  percentage: number;
  averagePerDay: number;
}

interface ActivityPieChartProps {
  data: ActivityPieChartEntry[];
}

const formatDailyAverage = (minutes: number): string => {
  if (minutes <= 0) {
    return '0 мин/день';
  }
  if (minutes >= 60) {
    const hours = minutes / 60;
    const formatted = hours >= 5 ? hours.toFixed(0) : hours.toFixed(1);
    return `${formatted} ч/день`;
  }
  return `${Math.round(minutes)} мин/день`;
};

const ActivityPieChart: React.FC<ActivityPieChartProps> = ({ data }) => {
  const total = data.reduce((sum, entry) => sum + entry.minutes, 0);

  const segments = useMemo(() => {
    const items: Array<{
      entry: ActivityPieChartEntry;
      startAngle: number;
      endAngle: number;
      path: string;
      largeArcFlag: number;
      rotation: number;
      midAngle: number;
    }> = [];

    if (total === 0) {
      return items;
    }

    let cumulative = 0;
    data.forEach((entry) => {
      const angle = (entry.minutes / total) * 360;
      const startAngle = cumulative;
      const endAngle = cumulative + angle;

      const largeArcFlag = angle > 180 ? 1 : 0;

      const startRadians = (Math.PI / 180) * startAngle;
      const endRadians = (Math.PI / 180) * endAngle;

      const radius = 80;
      const center = 90;

      const startX = center + radius * Math.cos(startRadians);
      const startY = center + radius * Math.sin(startRadians);
      const endX = center + radius * Math.cos(endRadians);
      const endY = center + radius * Math.sin(endRadians);

      const d = [
        `M ${center} ${center}`,
        `L ${startX} ${startY}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
        'Z',
      ].join(' ');

      const midAngle = startAngle + angle / 2;

      items.push({
        entry,
        startAngle,
        endAngle,
        path: d,
        largeArcFlag,
        rotation: midAngle,
        midAngle,
      });

      cumulative = endAngle;
    });

    return items;
  }, [data, total]);

  if (segments.length === 0) {
    return (
      <div className="activity-pie-chart__placeholder">
        Нет данных для выбранного периода
      </div>
    );
  }

  return (
    <div className="activity-pie-chart">
      <svg viewBox="0 0 180 180" className="activity-pie-chart__svg">
        {segments.map((segment, index) => {
          const color = ACTIVITY_COLORS[segment.entry.type];
          return (
            <path
              key={segment.entry.type}
              d={segment.path}
              fill={color}
              stroke="#ffffff"
              strokeWidth={1}
              className="activity-pie-chart__segment"
            />
          );
        })}

        <circle cx="90" cy="90" r="32" fill="#ffffff" />

        <text x="90" y="82" textAnchor="middle" className="activity-pie-chart__total">
          {Math.round((total / 60) * 10) / 10} ч
        </text>
        <text x="90" y="95" textAnchor="middle" className="activity-pie-chart__label">
          за период
        </text>
      </svg>

      <div className="activity-pie-chart__legend">
        {segments.map((segment) => {
          const entry = segment.entry;
          const color = ACTIVITY_COLORS[entry.type];
          const name = ACTIVITY_NAMES[entry.type];
          return (
            <div key={entry.type} className="activity-pie-chart__legend-item">
              <span className="activity-pie-chart__legend-color" style={{ backgroundColor: color }} />
              <div className="activity-pie-chart__legend-labels">
                <span className="activity-pie-chart__legend-name">{name}</span>
                <span className="activity-pie-chart__legend-meta">
                  {entry.percentage.toFixed(1)}% · {formatDailyAverage(entry.averagePerDay)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export type { ActivityPieChartEntry };
export default ActivityPieChart;
