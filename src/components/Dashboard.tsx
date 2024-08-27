import React from 'react';
import { Link } from 'react-router-dom';
import Layout from './Layout';

const DashboardCard: React.FC<{ title: string; value: string; link: string }> = ({ title, value, link }) => (
  <Link to={link} className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-3xl font-bold">{value}</p>
  </Link>
);

interface DashboardProps {
  logo: string;
}

const Dashboard: React.FC<DashboardProps> = ({ logo }) => {
  return (
    <Layout logo={logo}>
      <div className="container mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard title="Staff" value="25" link="/staff-resources" />
          <DashboardCard title="Active Customers" value="150" link="/customer-management" />
          <DashboardCard title="Pending Orders" value="10" link="/purchase-orders" />
          <DashboardCard title="Low Stock Items" value="5" link="/raw-goods" />
          <DashboardCard title="Today's Reservations" value="20" link="/customer-management" />
          <DashboardCard title="Open Work Orders" value="8" link="/work-orders" />
          <DashboardCard title="Today's Sales" value="$2,500" link="/sales-orders" />
          <DashboardCard title="Popular Dishes" value="View" link="/finished-goods" />
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;