import React from 'react';
import Layout from './Layout';

interface SalesOrdersProps {
  logo: string;
  restaurantName: string;
}

const SalesOrders: React.FC<SalesOrdersProps> = ({ logo, restaurantName }) => {
  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-6 text-center text-white">Sales Orders</h1>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Active Orders</h2>
          <p>View and manage current customer orders.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Order Processing</h2>
          <p>Process new orders and manage order status updates.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Payment Handling</h2>
          <p>Manage payments and track transaction history.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Sales Reports</h2>
          <p>Generate and view sales reports and analytics.</p>
        </div>
      </div>
    </Layout>
  );
};

export default SalesOrders;