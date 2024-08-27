import React from 'react';
import Layout from './Layout';

interface PurchaseOrdersProps {
  logo: string;
  restaurantName: string;
}

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({ logo, restaurantName }) => {
  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-6 text-center text-white">Purchase Orders</h1>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Active Orders</h2>
          <p>View and manage current purchase orders.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Vendor Management</h2>
          <p>Manage relationships with suppliers and vendors.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Order History</h2>
          <p>Review past purchase orders and analyze spending patterns.</p>
        </div>
      </div>
    </Layout>
  );
};

export default PurchaseOrders;