import { supabase } from '../supabaseClient';
import { toCamelCase, toSnakeCase } from '../utils/caseConverter';

const TARIFF_COLLECTION = 'tariffs';

export const financeService = {
    /**
     * Add a new fee/tariff item
     */
    addTariff: async (tariff) => {
        try {
            const { data, error } = await supabase
                .from(TARIFF_COLLECTION)
                .insert([toSnakeCase(tariff)])
                .select()
                .single();

            if (error) throw error;
            return data.id;
        } catch (error) {
            console.error("Error adding tariff:", error);
            throw error;
        }
    },

    /**
     * Get all tariff items
     */
    getAllTariffs: async () => {
        const { data, error } = await supabase
            .from(TARIFF_COLLECTION)
            .select('*')
            .order('item_name', { ascending: true });
            
        if (error) throw error;
        return toCamelCase(data);
    },

    /**
     * Update a tariff item
     */
    updateTariff: async (id, updates) => {
        const { error } = await supabase
            .from(TARIFF_COLLECTION)
            .update(toSnakeCase(updates))
            .eq('id', id);
            
        if (error) throw error;
    },

    /**
     * Delete a tariff item
     */
    deleteTariff: async (id) => {
        const { error } = await supabase
            .from(TARIFF_COLLECTION)
            .delete()
            .eq('id', id);
            
        if (error) throw error;
    }
};
