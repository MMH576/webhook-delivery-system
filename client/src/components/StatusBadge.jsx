const StatusBadge = ({ status }) => {
  const statusColor = () => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'dlq':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor()}`}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
