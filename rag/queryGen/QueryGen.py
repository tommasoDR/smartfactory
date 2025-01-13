import os

from dateutil.relativedelta import relativedelta
from itertools import product
from dotenv import load_dotenv
from rdflib import Graph
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

class QueryGenerator:
    """
    A class to generate from the user input, queries to interact with other modules.

    Every 'private' class method is called only with label == "kpi_calc" or label =="predictions".

    Attributes:
        ERROR_NO_KPIS (int): Error code indicating no KPIs were provided in a user request.
        ERROR_ALL_KPIS (int): Error code indicating all KPIs were requested in a user request.
        llm (object): Language model instance for processing user inputs.
        TODAY (datetime): Reference date.

    Methods:
        _string_to_array(string, type): Parses a string into an array based on KB definitions.
        _check_absolute_time_window(dates, label): Validates a time window and its consistency with the label.
        _kb_update(): Updates the internal state of the KB with machine and KPI data.
        _last_next_days(data, time, days): Calculates the date range for a given number of days.
        _last_next_weeks(data, time, weeks): Calculates the date range for a given number of weeks.
        _last_next_months(data, time, months): Calculates the date range for a given number of months.
        _date_parser(date, label): Parses and validates a date or time window.
        _json_parser(data, label): Converts processed data into a JSON-formatted structure.
        query_generation(input, label): Generates a query based on user input and predefined rules.
    """
    ERROR_NO_KPIS = 2
    ERROR_ALL_KPIS = 1

    def __init__(self, llm):
        """
        Initializes the QueryGenerator instance.

        Args:
            llm (object): Language model instance for processing user inputs.
        """
        self.llm=llm

    def _string_to_array(self,string ,type):
        """
        Parses a string into an array of valid KPIs, machines or the special tokens ['ALL'] and ['NULL'].

        There are specific cases where the llm may return kpis or machines which do not belong to the KB.
        Example: 'Assembly machine 6' is not in KB but it may be returned as a match because llm 
        may see it as a typo but because they are equally similar, the model can't disambiguate
        between the different Assembly machines actually in the KB.

        Args:
            string (str): Input string to parse.
            type (str): Type of entities to extract ("machines" or "kpis").

        Returns:
            list: Valid entities from the KB or the special values ['ALL'] or ['NULL'].
        """
        string = string.strip("[]").split(", ")
        array = []
        for x in string:
            x=x.strip("'")
            if (type == "machines" and (x in self.machine_res)) or (type == "kpis" and (x in self.kpi_res)) or x == "ALL" or x == "NULL":
                array.append(x)
        return array
    
    def _check_absolute_time_window(self, dates, label):
        """
        Validates with the respect to the userInput classification label, 
        an absolute time window (exact dates, not relative to the current day) for consistency.

        Args:
            dates (list): the array of the two dates of the time window to be checked
            label (str): Classification label ("kpi_calc" or "predictions").

        Returns:
            bool: True if the time window is valid, False otherwise.
        """
        # the time window is 'dates[0] -> dates[1]', check if dates[0] < dates[1] and for some formatting error
        try: 
            start = datetime.strptime(dates[0], "%Y-%m-%d")
            end = datetime.strptime(dates[1], "%Y-%m-%d")
        except:
            return False
        if (end -start).days < 0:
            return False
        """
        Due to the following user case the two delta variables are needed:
        Example: "predict/calculate X for the month of April 2024"
        If TODAY is somewhere in the middle of april, the query generator has to create a query
        which calculate only a fraction of the month.
        """
        delta_p = (end - self.TODAY).days
        delta_k = (start - self.TODAY).days
        if (delta_p > 0 and label == "predictions") or (delta_k < 0 and label == "kpi_calc"):
            return True
        # time window not consistent with label or attempt to calculate/predict for TODAY
        return False

            
    def _kb_update(self):
        """
        Updates the queryGen instance variables by checkin the current day and querying KB for available machines and KPIs.

        Queries the knowledge base file specified in the environment variables and updates the 'TODAY',
        `machine_res` and `kpi_res` instance variables with valid machine and KPI IDs.
        """
        # actual TODAY
        """
        temp = datetime.now()
        self.TODAY = datetime(year=temp.year,month=temp.month,day=temp.day)
        """
        # demo TODAY
        self.TODAY = datetime(year= 2024,month=10,day=19)
        kpi_query= """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX sa-ontology: <http://www.semanticweb.org/raffi/ontologies/2024/10/sa-ontology#>
        
        SELECT DISTINCT ?id
        WHERE {
            ?kpi sa-ontology:id ?id .
            ?kpi sa-ontology:atomic ?atomic .
        }
        """
        machine_query="""
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX sa-ontology: <http://www.semanticweb.org/raffi/ontologies/2024/10/sa-ontology#>
        
        SELECT DISTINCT ?id
        WHERE {
            ?machine sa-ontology:id ?id .
            ?machine sa-ontology:producesKPI ?kpi .
        }
        """
        graph = Graph()
        graph.parse(os.environ['KB_FILE_PATH'] + os.environ['KB_FILE_NAME'], format="xml")
        res = graph.query(kpi_query)
        self.kpi_res = []
        for row in res:
            self.kpi_res.append(str(row["id"]))
        res = graph.query(machine_query)
        self.machine_res = []
        for row in res:
            self.machine_res.append(str(row["id"]))

    def _last_next_days(self,date: datetime,time,days):
        """
        Calculates a time window based on the `time` parameter:
        - If `time` is "last", it returns a time window starting from the ('days')-th day before 'date' to the day before 'date'.
        - If `time` is "next", it returns a time window expressed as the number of days which occurs from the day after 'date' to the ('days')-th day after 'date'.

        Args:
            date (datetime): The reference date.
            time (str): Specifies "last"(kpi engine) for past days or "next"(predictor) for future days.
            days (int): The number of days that have passed/to pass from 'date' to the start/end of the time window.

        Returns:
            tuple: A tuple containing start and end dates as strings if time == "last",
            the integer 'days' if time == "next" or an error message.
        """
        if time == "last":
            start = date - timedelta(days=days)
            end = date - timedelta(days= 1)
            return start.strftime('%Y-%m-%d'),end.strftime('%Y-%m-%d')
        # time == 'next'   
        elif time == "next": 
            return days
        else: 
            return "INVALID DATE"
        
    def _last_next_weeks(self,date: datetime,time,weeks):
        """
        Calculates a time window based on the `time` parameter:
        - If `time` is "last", it returns a time window starting from the first day of the ('weeks')-th past week (with the respect to the week containing 'date')
        to the day before the one containing 'date'.
        - If `time` is "next", it returns a time window expressed as the number of days which occurs from the day after 'date' 
        to the last day of the ('weeks')-th week following the one containing date.

        Args:
            date (datetime): The reference date.
            time (str): Specifies "last"(kpi engine) for past weeks or "next"(predictor) for future weeks.
            weeks (int): The number of weeks that have passed/to pass from 'date' to the start/end of the time window.

        Returns:
            tuple: A tuple containing start and end dates as strings if time == "last",
            the integer which express the number of days which occurs from the day after 'date'
            to the last day of the ('weeks')-th week following the one containing date or
            an error message.
        """
        if time == "last":
            # calculate the day of the week of 'date' (0=Lunedì, 6=Domenica)
            start = date - timedelta(days=(7 * weeks) +date.weekday())
            end = date - timedelta(days= 1 +date.weekday())
            return start.strftime('%Y-%m-%d'),end.strftime('%Y-%m-%d')
        # time == next    
        elif time == "next":
            # 7 - date.weekday() -> monday of the following week
            return (7 - date.weekday()) + 7 * weeks - 1
        else: 
            return "INVALID DATE"
        
    def _last_next_months(self,date,time,months):
        """
        Calculates a time window based on the `time` parameter:
        - If `time` is "last", it returns a time window starting from the first day of the ('months')-th past month (with the respect to the month containing 'date')
        to the last day of the month before the one containing 'date'.
        - If `time` is "next", it returns a time window expressed as the number of days which occurs from the day after 'date' 
        to the last day of the ('months')-th month following the one containing date.

        Args:
            date (datetime): The reference date.
            time (str): Specifies "last"(kpi engine) for past months or "next"(predictor) for future months.
            months (int): The number of months that have passed/to pass from 'date' to the start/end of the time window.

        Returns:
            tuple: A tuple containing start and end dates as strings if time == "last",
            the integer which express the number of days which occurs from the day after 'date' 
            to the last day of the ('months')-th month following the one containing date or
            an error message.
        """
        first_of_the_current_month= date - relativedelta(days= date.day-1)
        if time == "last":
            end_of_the_month = first_of_the_current_month - relativedelta(days=1)
            first_of_the_month = first_of_the_current_month - relativedelta(months= months)
            return first_of_the_month.strftime('%Y-%m-%d') , end_of_the_month.strftime('%Y-%m-%d')
        # time == next    
        elif time == "next":
            first_of_the_month = first_of_the_current_month + relativedelta(months= 1)
            end_of_the_month = first_of_the_month + relativedelta(months= months) - relativedelta(days = 1)
            return (end_of_the_month - date).days
        else: 
            return "INVALID DATE"   
        
    
    def _date_parser(self,date,label):
        """
        Parses and validates a time window based on one retrieved from user input.

        Args:
            date (str): The user-specified time window (retrieved by the llm).
            label (str): The user input classification label, either "kpi_calc" or "predictions".

        Returns:
            tuple or str: A valid time window or "INVALID DATE" if parsing fails.
        """
        if date == "NULL": 
            # date not provided from the user => default action
            if label == "kpi_calc":
                return self._last_next_days(self.TODAY,"last",30)
            else:
                # predictions
                return self._last_next_days(self.TODAY,"next",30)
        # absolute time window
        if "->" in date:
            temp=date.split(" -> ")
            if not(self._check_absolute_time_window(temp,label)):
                return "INVALID DATE"
            delta= (datetime.strptime(temp[1], "%Y-%m-%d")-self.TODAY).days
            if label == "predictions":
                return delta
            if delta >= 0:
                # the time window is only partially calculable because TODAY is contained in it
                return temp[0], (self.TODAY- relativedelta(days=1)).strftime('%Y-%m-%d')
            return temp[0],temp[1]
        # relative time window
        if "<" in date:
            # date format: <last/next, X, days/weeks/months>
            temp=date.strip("<>").split(", ")
            temp[1]=int(temp[1])
            if (temp[0] == "last" and label != "kpi_calc") or (temp[0] == "next" and label != "predictions") or temp[1] == 0:
                return "INVALID DATE"
            if temp[2] == "days":
                return self._last_next_days(self.TODAY,temp[0],temp[1])
            elif temp[2] == "weeks":
                return self._last_next_weeks(self.TODAY,temp[0],temp[1])
            elif temp[2] == "months":
                return self._last_next_months(self.TODAY,temp[0],temp[1])
        return "INVALID DATE"    
    
    def _json_parser(self, data, label):
        """
        Parses processed LLM output into JSON format to send it to kpi engine or predictor.

        Args:
            data (str): LLM output in the format: OUTPUT: (query1), (query2), (query3)
            label (str): The user input classification label, either "kpi_calc" or "predictions".
        Returns:
            tuple: A JSON-compatible dictionary and an error code (if applicable).
        """
        json_out= []
        all_kpis = 0
        data = data.replace("OUTPUT: ","")
        data= data.strip("()").split("), (")
        # for each elem in data, a dictionary (json obj) is created
        for elem in data:
            obj={}
            # it is necessary to include ']' to the split because otherwise it would also be included in the strings of the generated array
            elem = elem.split("], ")
            kpis=elem[1]+"]"
            kpis = self._string_to_array(kpis,"kpis")
            # a request is invalid if it misses the kpi field or if the user query mentions 'all' kpis to be calculate/predicted
            # return also an error log expressing the user inability to make a request asking for all kpis (or none)
            if kpis == ["ALL"]:
                all_kpis = self.ERROR_ALL_KPIS
                continue
            if kpis == ["NULL"]:
                all_kpis= self.ERROR_NO_KPIS
                continue
            date = self._date_parser(elem[2],label)
            # if there is no valid time window, the related json obj is not built
            if date == "INVALID DATE":
                print("INVALID DATE")
                continue
            # kpi-engine get a time window with variable starting point while predictor starts always from the day next to the current one
            if label == "kpi_calc":
                obj["Date_Start"] = date[0]
                obj["Date_Finish"] = date[1]
            else:
                # predictions
                obj["Date_prediction"] = date

            machines=elem[0]+"]"
            # transform the string containing the array of machines in an array of string
            machines = self._string_to_array(machines,"machines")
            # machines == ["ALL"] and label == "predictions" => machines -: != ["ALL"/"NULL"]
            if machines == ["ALL"] and label == "predictions":
                machines = self.machine_res
            # (machines != ["NULL"/"ALL"]) => complete json generation (standard behaviour)
            if  machines != ["NULL"] and machines != ["ALL"]:                
                for machine, kpi in product(machines,kpis):
                    new_dict=obj.copy()
                    new_dict["Machine_Name"]=machine
                    new_dict["KPI_Name"] = kpi
                    json_out.append(new_dict)
            else:
                # (machines == ["ALL"/"NULL"] and label == "kpi_calc") or (machines == ["NULL"] and label == "predictions") 
                for kpi in kpis:
                    new_dict=obj.copy()
                    new_dict["KPI_Name"] = kpi
                    json_out.append(new_dict)

        if label == "predictions" :
            json_out={"value":json_out}
  
        return json_out,all_kpis

    def query_generation(self,input= "predict idle time max, cost wrking sum and good cycles min for last week for all the medium capacity cutting machine, predict the same kpis for Laser welding machines 2 for today. calculate the cnsumption_min for next 4 month and for Laser cutter the offline time sum for last 23 day. "
, label="kpi_calc"):
        """
        Generates a json query for calculating and predicting KPIs for machines based on user input.
        
        This method processes the user input: an llm matches machine and KPI identifiers from the KB and retrieve from the input
        usefull data to generate a formatted query that can be used as a request to the predictor and kpi engine.

        Arguments:
            - input (str): The user input
            - label (str): The user input classification label, either "kpi_calc" or "predictions" or "report".

        Returns:
            - A tuple containing two elements:
                1. If the label is 'report', a list with two dictionaries representing the json parsed results based on the user input.
                2. If the label is 'kpi_calc' or 'predictions', a single dictionary representing the json parsed result based on the user input.
        """

        self._kb_update()
        YESTERDAY = f"{(self.TODAY-relativedelta(days=1)).strftime('%Y-%m-%d')} -> {(self.TODAY-relativedelta(days=1)).strftime('%Y-%m-%d')}"
        query= f"""
            USER QUERY: {input}

            INSTRUCTIONS:
            TODAY is {self.TODAY}.
            Extract information from the USER QUERY based on the following rules and output it in the EXAMPLE OUTPUT specified format.
            All dates in the USER QUERY are in the format DD/MM/YYYY. When providing your OUTPUT, always convert all dates to the format YYYY-MM-DD. If a date range is given, maintain the range format (e.g., "01/12/2024 -> 10/12/2024" should become "2024-12-01 -> 2024-12-10").

            LIST_1 (list of machines): '{self.machine_res}'
            LIST_2 (list of kpis): '{self.kpi_res}'

            RULES:
            1. Match IDs:
                -Look for any terms in the query that match IDs from LIST_1 or LIST_2.
                -If a match contains a machine type without a specific number, return all machines of that type. Example: 'Testing Machine' -> ['Testing Machine 1', 'Testing Machine 2', 'Testing Machine 3'].
                -If no IDs from LIST_2 are associated with the matched KPIs, return ['NULL'] as [matched LIST_2 IDs].
                -If no IDs from LIST_1 are associated with the matched machines, return ['NULL'] as [matched LIST_1 IDs].
                -If 'all' IDs from LIST_2 are associated with the matched KPIs, return ['ALL'] as [matched LIST_2 IDs]. Example: 'predict all kpis for ...' -> ['ALL']
                -If 'all' IDs from LIST_1 are associated with the matched machines, return ['ALL'] as [matched LIST_1 IDs]. Example: 'calculate for all machines ...' -> ['ALL']
            2. Determine Time Window:
                -if there is a time window described by exact dates, use them, otherwise return the expression which individuates the time window: 'last/next X days/weeks/months' using the format <last/next, X, days/weeks/months>
                -If no time window is specified, use NULL.
                -if there is a reference to an exact month and a year, return the time windows starting from the first of that month and ending to the last day of that month.
                -Yesterday must be returned as {YESTERDAY}, today as {(self.TODAY).strftime('%Y-%m-%d')} -> {(self.TODAY).strftime('%Y-%m-%d')} and tomorrow as {(self.TODAY+relativedelta(days=1)).strftime('%Y-%m-%d')} -> {(self.TODAY+relativedelta(days=1)).strftime('%Y-%m-%d')}.
                -Allow for minor spelling or formatting mistakes in the matched expressions and correct them as done in the examples below.
            3. Handle Errors:
                -Allow for minor spelling or formatting mistakes in the input.
                -If there is ambiguity matching a kpi, you can match USER QUERY with the one in LIST_2 which ends with '_avg'"""
        # There is a different output format between report and (kpi_calc and predictions) use cases so there will be a different prompt
        # kpi_cal and predictions prompt
        if label == "kpi_calc" or label == "predictions":
            query+=f"""
            4. Output Format:
                -For each unique combination of machine IDs and KPIs, return a tuple in this format: ([matched LIST_1 IDs], [matched LIST_2 IDs], time window), exact dates are in the format 'YYYY-MM-DD -> YYYY-MM-DD'.
                
            NOTES:
            -Ensure output matches the one of the EXAMPLES below exactly, I need only the OUTPUT section.

            EXAMPLES:
            '
            INPUT: Calculate the kpi cost_idle arg and cost idle std for the assembly machine 1 and Low capacity cutting machine for the past 5 day, calculate offlinetime med for Assembly machine 3 for the last two months and cost_idle_avg for Assembly machine. How much do the Assembly machine 2 has worked the last three days? Can you calculate all kpis for 20/11/2024 -> 18/11/2024 for Low Capacity Cutting Machine 1?
            OUTPUT: (['Assembly Machine 1', 'Low Capacity Cutting Machine 1'], ['cost_idle_avg', 'cost_idle_std'], <last, 5, days>), (['Assembly Machine 3'], ['offline_time_med'], <last, 2, months>), (['Assembly Machine 1', 'Assembly Machine 2', 'Assembly Machine 3'], ['cost_idle_avg'], NULL), (['Assembly Machine 2'], ['working_time_sum'], <last, 3, days>), (['Low Capacity Cutting Machine 1'], ['ALL'], 2024-11-20 -> 2024-11-18)

            INPUT: Calculate using data from the last 2 weeks the standard deviation for cost_idle of Low capacity cutting machine 1 and Assemby Machine 2. Calculate for the same machines also the offline time median using data from the past month. Calculate the highest offline time for low capacity cutting machine 1?
            OUTPUT: (['Low Capacity Cutting Machine 1', 'Assembly Machine 2'], ['cost_idle_std'], <last, 2, weeks>), (['Low Capacity Cutting Machine 1', 'Assembly Machine 2'], ['offline_time_med'], <last, 1, months>), (['Low Capacity Cutting Machine 1'], ['offline_time_max'], NULL)

            INPUT: Calculate the offline time median about laste 3 weeks. Can you calculate the working time for Assembly machine 1 based on yesterday data, the same kpi dor Assembly machine 2 based on data from 03/05/2024 -> 07/06/2024. What is the day riveting machine 1 had the lowest working time last 2 months.
            OUTPUT: (['NULL'], ['offline_time_med'], <last, 3, weeks>), (['Assembly Machine 1'], ['working_time_avg'], {YESTERDAY}), (['Assembly Machine 2'], ['working_time_avg'], 2024-05-03 -> 2024-06-07), (['Riveting Machine'], ['working_time_min'], <last, 2, months>)

            INPUT: Predict working time min and the average for Assembly machine for {(self.TODAY + relativedelta(days=5)).strftime('%d/%m/%Y')} -> {(self.TODAY + relativedelta(days=13)).strftime('%d/%m/%Y')} and the same kpis for all machines. What will be the the total amount of working time for low capacity cutting machine 1 and assembly machine 1 for next 5 weeks.
            OUTPUT: (['Assembly Machine 1', 'Assembly Machine 2', 'Assembly Machine 3'], ['working_time_min','working_time_avg'], {(self.TODAY + relativedelta(days=5)).strftime('%Y-%m-%d')} -> {(self.TODAY + relativedelta(days=13)).strftime('%Y-%m-%d')}), (['ALL'], ['working_time_min','working_time_avg'], NULL), (['Low Capacity Cutting Machine 1', 'Assembly Machine 1'], ['working_time_sum'], <next, 5, weeks>)

            INPUT: Can you predict for next 2 days for Riveting machine 1? predict for all the assembly machine the cost idle average and the sum of working time for the next 3 weeks and for low capacity cutting machne the cost_idle_std for March 2025. predict also for Assembly machine 1 the cost_idle for the next two days.
            OUTPUT: (['Riveting Machine'], ['NULL'], <next, 2, days>), (['Assembly Machine 1', 'Assembly Machine 2', 'Assembly Machine 3'], ['cost_idle_avg', 'working_time_sum'], <next, 3, weeks>), (['Low Capacity Cutting Machine 1'], ['cost_idle_std'], 2025-03-01 -> 2025-03-31), (['Assembly Machine 1'], ['cost_idle_avg'], <next, 2, days>)
            '
            """
        else:
            query+=f"""
            4. Output Format:
                -For each unique combination of machine IDs and KPIs, return a tuple in this format: ([matched LIST_1 IDs], [matched LIST_2 IDs], <time window_prediction, time window_calculation>), exact dates are in the format 'YYYY-MM-DD -> YYYY-MM-DD'.
                -time window_prediction is the time window related to the prediction part of the report.
                -time window_calculation is the time window related to the calculation part of the report.
            NOTES:
            -Ensure output matches the one of the EXAMPLES below exactly, I need only the OUTPUT section.

            EXAMPLES:
            '
            INPUT: generate a report about the kpi cost_idle arg and cost idle std for the assembly machine 1 and Low capacity cutting machine for the past 5 day and the next 10 days, makes also a report about calculate offlinetime med for Assembly machine 3 using data from the last two months and predictiong the next 3 weeks. Can you make a report of all kpis for 20/11/2024 -> 18/11/2024 and predicting next month for Low Capacity Cutting Machine 1?
            OUTPUT: (['Assembly Machine 1', 'Low Capacity Cutting Machine 1'], ['cost_idle_avg', 'cost_idle_std'], <<last, 5, days>; <next, 10, days>>), (['Assembly Machine 3'], ['offline_time_med'], <<last, 2, months>; <next, 3, weeks>>), (['Low Capacity Cutting Machine 1'], ['ALL'], <2024-11-20 -> 2024-11-18; <next, 1, months>>)

            INPUT: Calculate a report for the last 2 weeks including the standard deviation and the avreage of the cost_idle for Low capacity cutting machine 1 and Assemby Machine 2. Calculate for the same machines also a report about the offline time median. generate a report about the highest offline time for low capacity cutting machine 1?
            OUTPUT: (['Low Capacity Cutting Machine 1', 'Assembly Machine 2'], ['cost_idle_std', 'cost_idle_avg'], <<last, 2, weeks>; NULL>), (['Low Capacity Cutting Machine 1', 'Assembly Machine 2'], ['offline_time_med'], <NULL; NULL>), (['Low Capacity Cutting Machine 1'], ['offline_time_max'], <NULL; NULL>)

            INPUT: Generate a report including the offline time median about laste 3 weeks and predict next 6 days. Can you generate a report about the working time for Assembly machine 1 predicting next 2 weeks, and a another report about the same kpi dor Assembly machine 2 based on data from 03/05/2024 -> 07/06/2024 and predicting the time window 07/07/2024 -> 09/07/2024.
            OUTPUT: (['NULL'], ['offline_time_med'], <<last, 3, weeks>; <next, 6, days>>), (['Assembly Machine 1'], ['working_time_avg'], <NULL; <next, 2, weeks>>), (['Assembly Machine 2'], ['working_time_avg'], <2024-05-03 -> 2024-06-07; 2024-07-07 -> 2024-07-09>)

            INPUT: make a report for working time min and average for Riveting machine 1 for {(self.TODAY + relativedelta(days=5)).strftime('%d/%m/%Y')} -> {(self.TODAY + relativedelta(days=13)).strftime('%d/%m/%Y')}. makes for all machines a report about total amount of working time using data from June 2024 and predict the next 5 weeks.
            OUTPUT: (['Riveting Machine'], ['working_time_min','working_time_avg'], <{(self.TODAY + relativedelta(days=5)).strftime('%Y-%m-%d')} -> {(self.TODAY + relativedelta(days=13)).strftime('%Y-%m-%d')}; NULL>), (['ALL'], ['working_time_sum'], <2024-06-01 -> 2024-06-30; <next, 5, weeks>>)

            INPUT: Can you generate a report predicting the next 2 days for Riveting machine 1? make a report for all the assembly machine including the cost idle average and the sum of working time using data from last 2 months and including a prediction for next 3 weeks. Generate the report for November 2024 low capacity cutting machne using the cost_idle_std, predicting March 2025. 
            OUTPUT: (['Riveting Machine'], ['NULL'], <NULL; <next, 2, days>>), (['Assembly Machine 1', 'Assembly Machine 2', 'Assembly Machine 3'], ['cost_idle_avg', 'working_time_sum'], <<last, 2, months>; <next, 3, weeks>>), (['Low Capacity Cutting Machine 1'], ['cost_idle_std'], <2024-11-01 -> 2024-11-30; 2025-03-01 -> 2025-03-31>)
            '
            """

        data = self.llm.invoke(query)
        data = data.content.strip("\n")
        print(data)
        
        if label == "report":
            # data needs to be splitted in order to make two _json_parser calls
            data_pred= "OUTPUT: "
            data_kpi_calc= "OUTPUT: "
            data = data.replace("OUTPUT: ","")
            data= data.strip("()").split("), (")
            # for each elem in data, a dictionary (json obj) is created
            for elem in data:
                # it is necessary to include ']' to the split because otherwise it would also be included in the strings of the generated array
                elem = elem.split("], ")
                kpis=elem[1]+"]"
                machines=elem[0]+"]"
                # remove the first and last character of the pattern <tw_kpi_calc, tw_prediction>
                elem[2]=elem[2][1:-1]
                dates = elem[2].split("; ")
                tw_prediction = dates[1]
                tw_kpi_calc= dates[0]
                data_pred+=f"({machines}, {kpis}, {tw_prediction}), "
                data_kpi_calc+=f"({machines}, {kpis}, {tw_kpi_calc}), "
            data_kpi_calc=data_kpi_calc.strip(" ,")
            data_pred = data_pred.strip(" ,")
            kpi_json_obj, all_kpis = self._json_parser(data_kpi_calc,"kpi_calc")
            pred_json_obj, all_kpis = self._json_parser(data_pred,"predictions")
            print("\n")
            print(kpi_json_obj)
            print(pred_json_obj)
            return [kpi_json_obj,pred_json_obj], all_kpis
        else:
            # label == "predictions" or label == "kpi_calc"
            json_obj, all_kpis = self._json_parser(data,label)
            print("\n")
            print(json_obj)
            return json_obj,all_kpis
        
        
        

        
    