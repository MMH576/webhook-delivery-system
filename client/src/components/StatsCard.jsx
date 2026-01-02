const StatsCard = ({ title, value, color }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm font-medium text-gray-500">{title}</div>
      <div className={`text-3xl font-bold ${color || 'text-gray-900'}`}>{value}</div>
    </div>
  );
};

export default StatsCard;
