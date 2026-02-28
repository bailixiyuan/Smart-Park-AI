import React from 'react';

interface InfoCardProps {
  label: string;
  value: string | React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({ label, value, icon, className = '' }) => {
  return (
    <div className={`bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-gray-100 shadow-sm ${className}`}>
      <div className="flex items-center space-x-3">
        {icon && <div className="text-indigo-500 bg-indigo-50 p-2 rounded-lg">{icon}</div>}
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
          <div className="mt-1 text-gray-900 font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
};