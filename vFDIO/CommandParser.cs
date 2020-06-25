using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace vFDIO
{
    class CommandParser
    {
        Dictionary<string, Tuple<int, string>> commands = new Dictionary<string, Tuple<int, string>>()
        {
            { "AM",Tuple.Create(3,"") }, 
            { "DM",Tuple.Create(1,"") },
            { "FP",Tuple.Create(7,"") },
            { "FR",Tuple.Create(1,"") },
            { "GI",Tuple.Create(2,"") },
            { "HM",Tuple.Create(1,"") },
            { "PR",Tuple.Create(2,"") },
            //{ "RB",Tuple.Create(0,"") },
            { "RF",Tuple.Create(1,"") },
            { "RS",Tuple.Create(1,"") },
            { "RX",Tuple.Create(1,"") },
            { "SP",Tuple.Create(3,"") },
            { "SR",Tuple.Create(3,"") },
            { "WR",Tuple.Create(1,"") },
        };
        public bool ParseCommand(string UserInput)
        {
            UserInput = UserInput.ToUpper();
            string[] UserInputSplit = UserInput.Split(null);

            if(!commands.ContainsKey(UserInputSplit[0]))
                return false;
            

            Tuple<int, string> CommandTemplate = commands[UserInputSplit[0]];
            if(UserInputSplit.Length < CommandTemplate.Item1)
                return false;

            return true;
            
        }    
    }
}
