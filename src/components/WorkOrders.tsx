import React from 'react';
import Layout from './Layout';

interface WorkOrdersProps {
  logo: string;
  restaurantName: string;
}

const WorkOrders: React.FC<WorkOrdersProps> = ({ logo, restaurantName }) => {
  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-6 text-center text-white">Work Orders</h1>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Active Orders</h2>
          <p>View and manage current kitchen orders and tasks.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Task Assignment</h2>
          <p>Assign tasks to specific kitchen staff members.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Order Progress</h2>
          <p>Track the progress of orders through various stages of preparation.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Performance Metrics</h2>
          <p>Monitor kitchen performance metrics such as order completion times.</p>
        </div>
      </div>
    </Layout>
  );
};

export default WorkOrders;