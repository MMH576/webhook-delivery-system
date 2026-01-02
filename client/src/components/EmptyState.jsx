const EmptyState = ({ message }) => {
  return (
    <tr>
      <td colSpan="100%" className="px-6 py-8 text-center text-gray-500">
        {message}
      </td>
    </tr>
  );
};

export default EmptyState;
